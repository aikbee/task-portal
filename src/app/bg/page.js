import BackgroundStage from "@/components/shell/BackgroundStage";

export const metadata = { title: "Background", robots: { index: false, follow: false } };

/**
 * Nothing but the animated background: the native apps show this page behind their own screens.
 * /bg?style=luckycat&theme=dark&accent=rose&intensity=normal&animate=1&motion=normal
 * Public on purpose (see PUBLIC in src/proxy.js): it carries no data, only the animation.
 */
export default function Page() {
  return <BackgroundStage />;
}
