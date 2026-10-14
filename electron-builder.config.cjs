/**
 * electron-builder 打包配置，见 https://www.electron.build
 * 通过 scripts/dist-desktop.mjs 以 build/desktop 作为项目目录运行，
 * 这样 electron-builder 不会把根目录的 node_modules 打进安装包。
 */
const path = require("node:path");
const electronVersion = require("electron/package.json").version;

module.exports = {
  appId: "app.prism.chat",
  productName: "Prism",
  copyright: "Copyright © 2026 Prism",
  electronVersion,
  directories: {
    app: path.join(__dirname, "build/desktop"),
    output: path.join(__dirname, "dist"),
    buildResources: path.join(__dirname, "build/resources"),
  },
  files: ["**/*"],
  asar: true,
  npmRebuild: false,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "Prism-${version}-windows-${arch}-setup.${ext}",
    // 自动更新：生成 latest.yml，应用从这个仓库的 GitHub Releases 检查新版本
    publish: { provider: "github", owner: "pink-pig-djw", repo: "Prism", releaseType: "release" },
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: "Prism",
  },
  mac: {
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    category: "public.app-category.productivity",
    artifactName: "Prism-${version}-mac-${arch}.${ext}",
    // 没有 Apple 开发者证书：使用 ad-hoc 签名，否则 Apple 芯片的 Mac 会提示「已损坏」
    identity: "-",
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },
  dmg: {
    title: "Prism ${version}",
  },
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Utility",
    synopsis: "AI 聊天应用",
    syncDesktopName: true,
    maintainer: "Prism",
    artifactName: "Prism-${version}-linux-${arch}.${ext}",
  },
};
