function assertTrustedSender(event) {
  const url = event.senderFrame?.url || event.sender?.getURL?.() || '';
  if (!url.startsWith('file://')) {
    throw new Error(`Blocked IPC from untrusted sender: ${url}`);
  }
}

function trustedHandler(handler) {
  return (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  };
}

function assertFilePath(value, name = 'filePath') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

module.exports = { assertTrustedSender, trustedHandler, assertFilePath };