import { useEffect, createRef } from "react";
import { PluginSpec } from "molstar/lib/mol-plugin/spec";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";

import "molstar/lib/mol-plugin-ui/skin/light.scss";

declare global {
  interface Window {
    molstar?: PluginUIContext;
  }
}

export function MolStarWrapper(props: { value: string }) {
  const parent = createRef<HTMLDivElement>();

  useEffect(() => {
    async function init() {
        const spec: PluginSpec = {
            actions: [],
            behaviors: [],
            layout: {
                initial: {
                    isExpanded: false,
                    showControls: false,
                } as any
            },
            animations: []
        }

        window.molstar = await createPluginUI(parent.current as HTMLDivElement, spec);

        const data = await window.molstar.builders.data.download(
          { url: `https://files.rcsb.org/download/${props.value}.pdb` },
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

  return<div ref={parent} style={{ position: "absolute", left: 0, right: 0, margin: "0 auto", width: "75%", height: "75%", filter: "invert(1)" }}/>
}
