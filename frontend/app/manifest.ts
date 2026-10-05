import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XLBSTUDY",
    short_name: "XLBSTUDY",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#0071e3",
    icons: [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }], // ponytail: add 192/512 PNGs for installability on Android
  };
}
