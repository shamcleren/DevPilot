import { chmodSync, existsSync } from "node:fs";
import path from "node:path";

export function resolveResourcesDir(appOutDir, electronPlatformName, productFilename) {
  if (electronPlatformName === "darwin") {
    return path.join(appOutDir, `${productFilename}.app`, "Contents", "Resources");
  }

  return path.join(appOutDir, "resources");
}

export default async function afterPack(context) {
  const resourcesDir = resolveResourcesDir(
    context.appOutDir,
    context.electronPlatformName,
    context.packager.appInfo.productFilename,
  );
  const hooksDir = path.join(resourcesDir, "scripts", "hooks");
  const hookScripts = ["cursor-agent-hook.sh", "codebuddy-hook.sh"];

  for (const filename of hookScripts) {
    const targetPath = path.join(hooksDir, filename);
    if (existsSync(targetPath)) {
      chmodSync(targetPath, 0o755);
    }
  }
}
