import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

interface Props {
  pdbId?: string;
  pdbData?: string;
  ligandPdb?: string;
  height?: number;
}

export default function ProteinViewer({ pdbId, pdbData, ligandPdb, height = 400 }: Props) {
  const [style, setStyle] = useState<"cartoon" | "stick" | "surface">("cartoon");
  const [spinning, setSpinning] = useState(true);

  const html = buildViewerHtml(pdbId, pdbData, ligandPdb, style, spinning);

  return (
    <View>
      <View style={[styles.viewer, { height }]}>
        <WebView
          source={{ html }}
          style={{ flex: 1, backgroundColor: "#0a0a0a" }}
          javaScriptEnabled
          originWhitelist={["*"]}
          scrollEnabled={false}
        />
      </View>

      <View style={styles.controls}>
        {(["cartoon", "stick", "surface"] as const).map((s) => (
          <Pressable
            key={s}
            style={[styles.btn, style === s && styles.btnActive]}
            onPress={() => setStyle(s)}
          >
            <Text style={[styles.btnText, style === s && styles.btnTextActive]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.btn, spinning && styles.btnSpin]}
          onPress={() => setSpinning(!spinning)}
        >
          <Text style={[styles.btnText, spinning && { color: "#fff" }]}>
            {spinning ? "Stop" : "Spin"}
          </Text>
        </Pressable>
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
  viewer: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  controls: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    justifyContent: "center",
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  btnActive: {
    backgroundColor: "#fff",
  },
  btnSpin: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  btnText: {
    fontSize: 10,
    color: "#9ca3af",
  },
  btnTextActive: {
    color: "#000",
  },
});
