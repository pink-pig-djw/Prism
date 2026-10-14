/** 当前构建的目标平台：网页 / 桌面（Electron）/ 手机（Capacitor 安卓） */
export type Target = "web" | "desktop" | "mobile";

export const TARGET: Target = (process.env.NEXT_PUBLIC_PRISM_TARGET as Target | undefined) ?? "web";
