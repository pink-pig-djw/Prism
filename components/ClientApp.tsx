"use client";

import dynamic from "next/dynamic";

// 聊天数据保存在浏览器本地，整个应用只在客户端渲染
const App = dynamic(() => import("./App"), { ssr: false });

export default function ClientApp() {
  return <App />;
}
