import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rachit.pocket",
  appName: "Pocket New",
  webDir: "mobile-dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
