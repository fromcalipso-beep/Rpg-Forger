# RPG Character Manager — Android APK Build Guide

This project is pre-configured with **Capacitor** (`com.rpgcharactermanager.app`) and an offline-first architecture (IndexedDB + Capacitor Filesystem + local image management).

## Prerequisites for APK Compilation

Because the AI Studio cloud container does not include the Android SDK / JDK, compile the `.apk` locally or in CI using:

- **Node.js** 20+
- **Java JDK** 17 or 21
- **Android Studio** (or Android SDK Command-Line Tools with Platform 34/35 & Build Tools)

## Build Steps

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the production web bundle (`dist/`):
   ```bash
   npm run build
   ```

3. Sync web assets and plugins to the Capacitor Android project:
   ```bash
   npx cap sync android
   ```

4. Build the installable Debug APK via Gradle:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   The generated APK will be located at:
   `android/app/build/outputs/apk/debug/app-debug.apk`

5. Or open directly in Android Studio to sign and build a Release APK / AAB:
   ```bash
   npx cap open android
   ```

## Offline & Android Permissions

- **Zero Mandatory Internet**: All sheets, attributes, resources, inventory, equipment slots, combat turns, notes, and templates work 100% offline.
- **Image Storage**: Gallery images selected by the user are persisted locally in IndexedDB and mirrored to Capacitor `Directory.Data` (`rpg_images/`) without bloating character JSON records.
- **Permissions (`AndroidManifest.xml`)**:
  - `android.permission.READ_MEDIA_IMAGES` (Android 13+)
  - `android.permission.READ_EXTERNAL_STORAGE` (Android 12 and below)
  - `android.permission.WRITE_EXTERNAL_STORAGE` (`maxSdkVersion="29"`)
