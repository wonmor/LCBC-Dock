import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { Segmented, TagButton } from "@/components/Bauhaus";
import { palette, rule, space } from "@/lib/theme";

interface Props {
  pdbId?: string;
  pdbData?: string;
  ligandPdb?: string;
  height?: number;
}

type ViewStyleName = "cartoon" | "stick" | "surface";

/** 3Dmol.js viewer. The viewport stays dark so molecules read clearly; the
 *  Bauhaus chrome is the black frame and the controls below it. */
export default function ProteinViewer({ pdbId, pdbData, ligandPdb, height = 400 }: Props) {
  const [style, setStyle] = useState<ViewStyleName>("cartoon");
  const [spinning, setSpinning] = useState(true);

  const html = buildViewerHtml(pdbId, pdbData, ligandPdb, style, spinning);

  return (
    <View style={styles.wrap}>
      <View style={[styles.viewer, { height }]}>
        <WebView
          source={{ html }}
          style={{ flex: 1, backgroundColor: palette.viewport }}
          javaScriptEnabled
          originWhitelist={["*"]}
          scrollEnabled={false}
        />
      </View>

      <View style={styles.controls}>
        <View style={{ flex: 1 }}>
          <Segmented
            value={style}
            onChange={setStyle}
            options={[
              { value: "cartoon", label: "Cartoon" },
              { value: "stick", label: "Stick" },
              { value: "surface", label: "Surface" },
            ]}
          />
        </View>
        <TagButton
          title={spinning ? "Stop" : "Spin"}
          icon={spinning ? "pause" : "sync"}
          selected={spinning}
          onPress={() => setSpinning(!spinning)}
          style={{ minHeight: 44 }}
        />
      </View>
    </View>
  );
}

function buildViewerHtml(
  pdbId?: string,
  pdbData?: string,
  ligandPdb?: string,
  style: string = "cartoon",
  spinning: boolean = true
) {
  const fetchCode = pdbData
    ? `var pdbData = ${JSON.stringify(pdbData)};`
    : pdbId
    ? `var pdbData = null;
       await fetch("https://files.rcsb.org/download/${pdbId}.pdb")
         .then(r => r.text())
         .then(d => { pdbData = d; });`
    : `var pdbData = null;`;

  const ligandCode = ligandPdb
    ? `viewer.addModel(${JSON.stringify(ligandPdb)}, "pdb");
       viewer.setStyle({model:1}, {
         stick: {colorscheme:"greenCarbon", radius:0.15},
         sphere: {colorscheme:"greenCarbon", scale:0.3}
       });`
    : "";

  let styleCode = "";
  switch (style) {
    case "cartoon":
      styleCode = `viewer.setStyle({model:0}, {cartoon:{color:"spectrum",thickness:0.4}});`;
      break;
    case "stick":
      styleCode = `viewer.setStyle({model:0}, {stick:{colorscheme:"Jmol",radius:0.12}});`;
      break;
    case "surface":
      styleCode = `viewer.setStyle({model:0}, {cartoon:{color:"spectrum",opacity:0.5,thickness:0.3}});
                    viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity:0.7,color:"white"}, {model:0});`;
      break;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
  <script src="https://3Dmol.org/build/3Dmol-min.js"></script>
  <style>
    * { margin:0; padding:0; }
    body { background:#0a0a0a; overflow:hidden; }
    #viewer { width:100vw; height:100vh; }
  </style>
</head>
<body>
  <div id="viewer"></div>
  <script>
    (async function(){
      ${fetchCode}
      if(!pdbData) return;

      var viewer = $3Dmol.createViewer("viewer", {
        backgroundColor: 0x0a0a0a,
        antialias: true,
        cartoonQuality: 8
      });

      // Clean water
      var lines = pdbData.split("\\n").filter(function(l){
        return !(l.startsWith("HETATM") && l.substring(17,20).trim()==="HOH");
      });
      viewer.addModel(lines.join("\\n"), "pdb");
      ${styleCode}
      ${ligandCode}
      viewer.zoomTo();
      viewer.spin(${spinning});
      viewer.render();
    })();
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  wrap: { gap: space.s },
  viewer: {
    overflow: "hidden",
    backgroundColor: palette.viewport,
    borderWidth: rule.regular,
    borderColor: palette.ink,
  },
  controls: { flexDirection: "row", gap: space.s, alignItems: "stretch" },
});
