import { z } from "zod";

const ascValidateStepSchema = z.object({
  order: z.number().optional(),
  blocking: z.boolean().optional(),
  severity: z.enum(["error", "warning", "info"]).optional(),
  checkId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1),
  remediation: z.string().trim().min(1).optional(),
  locale: z.string().trim().min(1).optional(),
  field: z.string().trim().min(1).optional()
});

const ascValidatePayloadSchema = z.object({
  versionString: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
  summary: z
    .object({
      errors: z.number().int().nonnegative().optional(),
      warnings: z.number().int().nonnegative().optional(),
      infos: z.number().int().nonnegative().optional(),
      blocking: z.number().int().nonnegative().optional()
    })
    .optional(),
  remediation: z
    .object({
      steps: z.array(ascValidateStepSchema).min(1)
    })
    .optional(),
  checks: z.array(ascValidateStepSchema).min(1).optional()
});

export type AscValidateStep = z.infer<typeof ascValidateStepSchema>;

export interface FormattedAscValidateFailure {
  title: string;
  body: string;
  command: string;
}

const ASC_COMMAND_FAILED_PATTERN =
  /^asc command failed \((.+)\):\s*([\s\S]+)$/;

function formatStepLine(step: AscValidateStep): string {
  const localePrefix =
    step.locale !== undefined ? `[${step.locale}] ` : "";
  const lines = [`• ${localePrefix}${step.message}`];

  if (step.remediation) {
    lines.push(`  → ${step.remediation}`);
  }

  return lines.join("\n");
}

function formatSeverityGroup(
  label: string,
  steps: AscValidateStep[]
): string | null {
  if (steps.length === 0) {
    return null;
  }

  return `*${label} (${steps.length})*\n${steps.map(formatStepLine).join("\n")}`;
}

function buildTitle(
  versionString: string | undefined,
  platform: string | undefined,
  blockingCount: number
): string {
  const versionLabel = [versionString, platform].filter(Boolean).join(" ");

  if (blockingCount > 0) {
    if (versionLabel.length > 0) {
      return `asc validate blocked ${versionLabel}`;
    }

    const issueLabel = blockingCount === 1 ? "issue" : "issues";
    return `asc validate found ${blockingCount} blocking ${issueLabel}`;
  }

  if (versionLabel.length > 0) {
    return `asc validate failed for ${versionLabel}`;
  }

  return "asc validate failed";
}

function countBlockingIssues(steps: AscValidateStep[]): number {
  return steps.filter(
    (step) => step.blocking === true || step.severity === "error"
  ).length;
}

export function formatAscValidateFailure(
  errorMessage: string
): FormattedAscValidateFailure | null {
  const match = errorMessage.match(ASC_COMMAND_FAILED_PATTERN);
  if (!match) {
    return null;
  }

  const command = match[1]?.trim() ?? "";
  const payload = match[2]?.trim() ?? "";

  if (!/\bvalidate\b/.test(command)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  const result = ascValidatePayloadSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  const data = result.data;
  const steps = data.remediation?.steps ?? data.checks ?? [];
  if (steps.length === 0) {
    return null;
  }

  const blockingCount = data.summary?.blocking ?? countBlockingIssues(steps);
  const title = buildTitle(data.versionString, data.platform, blockingCount);

  const errorSteps = steps.filter((step) => step.severity === "error");
  const warningSteps = steps.filter((step) => step.severity === "warning");
  const infoSteps = steps.filter((step) => step.severity === "info");
  const unclassifiedSteps = steps.filter((step) => step.severity === undefined);

  const body = [
    formatSeverityGroup("Blocking", errorSteps),
    formatSeverityGroup("Warnings", warningSteps),
    formatSeverityGroup("Info", infoSteps),
    formatSeverityGroup("Issues", unclassifiedSteps)
  ]
    .filter((group): group is string => group !== null)
    .join("\n\n");

  if (body.length === 0) {
    return null;
  }

  return {
    title,
    body,
    command
  };
}

export function truncateSlackText(text: string, maxLength = 2800): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 20).trimEnd()}\n\n_(truncated)_`;
}
