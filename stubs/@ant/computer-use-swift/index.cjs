const unsupported = async () => {
  throw new Error("@ant/computer-use-swift is unavailable in the public-safe build.");
};

module.exports = {
  tcc: {
    checkAccessibility: () => false,
    checkScreenRecording: () => false,
  },
  apps: {
    listInstalled: async () => [],
  },
  captureExcluding: unsupported,
  captureRegion: unsupported,
  resolvePrepareCapture: unsupported,
};
