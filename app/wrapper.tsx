import { useEffect, createRef } from "react";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
/*  Might require extra configuration,
see https://webpack.js.org/loaders/sass-loader/ for example.
create-react-app should support this natively. */
import "molstar/lib/mol-plugin-ui/skin/light.scss";

declare global {
  interface Window {
    molstar?: PluginUIContext;
  }
}

export function MolStarWrapper() {
  const parent = createRef<HTMLDivElement>();

  useEffect(() => {
    async function init() {
        window.molstar = await createPluginUI(parent.current as HTMLDivElement);

        const data = await window.molstar.builders.data.download(
          { url: `https://files.rcsb.org/download/1LOL.pdb` }, /* replace with your URL */
          { state: { isGhost: true } }
        );
        const trajectory =
          await window.molstar.builders.structure.parseTrajectory(data, "pdb");
        await window.molstar.builders.structure.hierarchy.applyPreset(
          trajectory,
          "default"
        );
    }
    init();
    return () => {
      window.molstar?.dispose();
      window.molstar = undefined;
    };
  }, []);

  return <div ref={parent} style={{ position: "absolute", width: "75%", height: "75%", filter: "invert(1)" }}/>;
}