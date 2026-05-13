import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-find-my-family",
  description: "Opt-in ephemeral family location sharing over the mesh, no account, no server",
  accentHex: "#fb923c",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
