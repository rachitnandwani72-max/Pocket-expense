# Pocket Expense

Pocket Expense is a private-first monthly expense tracker with quick entry,
category views, complete monthly transactions, savings and target tracking,
reports, backup and restore, dark mode, and offline support.

The same React interface powers:

- the hosted installable web app (PWA);
- the bundled Android app built with Capacitor; and
- the iPhone/iPad web-app experience installed from Safari.

## Privacy model

Expense records, balances, targets, preferences, and the user's name are kept
in that device's browser storage. They are not included in the source code and
are not sent to a server. Backup and restore use a user-controlled JSON file.

## Web development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The hosted Sites build uses vinext and the project configuration in
`.openai/hosting.json`.

## Mobile development

The mobile bundle has its own Vite entry point in `mobile/` and reuses the
dashboard component and stylesheet from `app/`.

```bash
npm run mobile:build
npm run mobile:sync
```

### Android APK

Requirements:

- JDK 21
- Android SDK Platform 36
- Android SDK Build Tools 35 or newer

On Windows, after setting `JAVA_HOME` and the Android SDK location:

```powershell
npm run mobile:sync
cd android
./gradlew.bat assembleDebug
```

The test APK is created at
`android/app/build/outputs/apk/debug/app-debug.apk`. A public Play Store release
must use a user-owned release signing key and an Android App Bundle.

## Main source files

- `app/PocketDashboard.tsx`: expense logic and all application screens
- `app/globals.css`: responsive design, themes, charts, and safe-area handling
- `mobile/main.tsx`: bundled mobile entry point
- `vite.mobile.config.ts`: mobile web-asset build
- `capacitor.config.ts`: native app identity and web bundle configuration
- `android/`: Android wrapper and branded native resources
- `public/sw.js`: hosted web-app offline cache
- `public/manifest.webmanifest`: installable web-app metadata

## Data safety

The current Android build declares only Android's internet permission. It does
not request contacts, camera, microphone, location, or broad file access.
