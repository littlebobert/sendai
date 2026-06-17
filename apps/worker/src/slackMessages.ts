interface SlackSectionBlock {
  type: "section";
  text: {
    type: "mrkdwn";
    text: string;
  };
}

export function buildExecutionFailureBlocks(
  title: string,
  message: string
): SlackSectionBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${title}*\n${message}`
      }
    }
  ];
}
