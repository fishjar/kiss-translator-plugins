// Default protocol tests must inject their HTTP responses, never call a vendor.
globalThis.fetch = async () => {
  throw new Error(
    "Network is disabled in offline protocol tests. Inject a response instead.",
  );
};
