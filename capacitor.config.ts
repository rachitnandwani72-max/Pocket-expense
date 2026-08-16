import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rachit.pocketexpense",
  appName: "Pocket",
  webDir: "mobile-dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
