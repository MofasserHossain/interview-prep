# React Native Builds, Signing And Store Release Interview Guide

How a React Native app actually becomes an installable artifact: generating
release builds for Android and iOS, APK versus AAB versus IPA, keystores,
certificates and provisioning profiles, versioning, build flavors and schemes,
EAS Build, fastlane, CI/CD, tester distribution, staged rollout, native build
failures, and build-time optimization.

## 1. How Do You Generate A Release Build For Android?

Gradle does the work. Two outputs, depending on what you are producing.

```bash
cd android

./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease     # -> app/build/outputs/bundle/release/app-release.aab
```

What the release task does beyond a debug build: it bundles the JavaScript into
the binary (rather than loading it from Metro), compiles it to Hermes bytecode,
runs R8 for minification and shrinking if enabled, and signs the artifact with
your release signing config.

To test a release build on a device without going near the store:

```bash
npx react-native run-android --mode release
```

Interview trap:

A release build with no signing config configured falls back to the debug keystore
on some setups, producing an artifact that installs locally but is rejected by
Play. "It built fine" is not the same as "it is signed with the right key".

## 2. What Is The Difference Between An APK, An AAB, And An IPA?

| Artifact | Platform | What it is | Used for |
| --- | --- | --- | --- |
| `.apk` | Android | a single installable package | direct install, sideloading, QA |
| `.aab` | Android | a publishing format Play splits per device | Play Store uploads (required) |
| `.ipa` | iOS | a signed app archive | TestFlight and App Store |

The **Android App Bundle** is the important one to explain. You upload one `.aab`
containing every architecture, density, and language. Google Play then generates
and signs a minimal APK for each device, so a user downloads only the `arm64`
slice and their own language instead of everything.

Benefits:

- Meaningfully smaller downloads, often 20-40% less than a universal APK.
- Play Feature Delivery and asset packs become possible.
- Required for new apps and updates on Google Play.

Tradeoff:

Because Play re-signs the delivered APKs, you must enrol in **Play App Signing**.
You no longer hold the key that end users' devices verify — which is a benefit for
key loss and a constraint if you need reproducible, self-signed artifacts.

For sideloading or non-Play distribution you still need an APK, which you can
extract from a bundle with `bundletool`.

## 3. How Does Android Code Signing Work?

Every Android app is signed with a key, and **the signature identity must never
change** across updates, or the store treats it as a different app and users
cannot upgrade.

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

```gradle
// android/app/build.gradle
signingConfigs {
  release {
    storeFile file(MYAPP_UPLOAD_STORE_FILE)
    storePassword MYAPP_UPLOAD_STORE_PASSWORD
    keyAlias MYAPP_UPLOAD_KEY_ALIAS
    keyPassword MYAPP_UPLOAD_KEY_PASSWORD
  }
}
```

The two-key model that trips people up:

- The **upload key** is what you sign with and what Play uses to verify *you*.
- The **app signing key** is what Google holds and uses to sign the APKs
  delivered to devices.

Why it matters:

If you lose the upload key you can request a reset from Google and keep shipping.
If you never enrolled in Play App Signing and you lose your single signing key,
**you can never update that app again** — you have to publish a new listing and
lose your installs and reviews. That asymmetry is the whole reason Play App
Signing exists.

Important:

Credentials go in `~/.gradle/gradle.properties` or CI secrets, never in the repo.
A keystore committed to git is a full app-identity compromise.

## 4. How Does iOS Code Signing Work?

iOS signing has four pieces, and interviewers ask because people usually only
know "Xcode did something".

```viz
type: flow
title: What iOS signing actually needs
Apple Developer account :: the team that owns the app
App ID :: the bundle identifier plus enabled capabilities
Certificate :: proves who built it - development or distribution
Provisioning profile :: ties App ID + certificate + devices together
Signed .ipa :: the artifact Apple will accept
```

- **Certificate** — your team's signing identity. A *development* certificate
  signs builds for registered devices; a *distribution* certificate signs builds
  for TestFlight and the App Store.
- **App ID** — the bundle identifier, plus the capabilities it is allowed to use
  (push notifications, associated domains, In-App Purchase, HealthKit). Enabling
  a capability in Xcode changes the App ID, which invalidates the profile.
- **Provisioning profile** — the document that says "this certificate may sign
  this App ID, for these devices, with these entitlements".
- **Entitlements** — what the app is permitted to do at runtime, embedded in the
  signature and checked against the profile.

**Automatic signing** lets Xcode manage all of it and is fine for a solo
developer. **Manual signing** is what teams use on CI, because automatic signing
needs an interactive Apple account session.

Edge cases:

- Adding push notifications or universal links changes entitlements, so the
  profile must be regenerated — this is the cause of most "it worked yesterday"
  signing failures.
- Certificates expire annually; profiles expire too. A build that suddenly fails
  on CI with no code change is usually an expired certificate.
- `fastlane match` exists to solve certificate sharing: it stores encrypted
  certificates and profiles in a private git repo so every machine and CI runner
  uses the same identity instead of each developer creating their own.

## 5. How Do You Generate A Release Build For iOS?

```bash
# Locally, on a Mac
cd ios && pod install
# Then in Xcode: select "Any iOS Device", Product > Archive
```

Or headless, which is what CI runs:

```bash
xcodebuild -workspace MyApp.xcworkspace \
  -scheme MyApp -configuration Release \
  -archivePath build/MyApp.xcarchive archive

xcodebuild -exportArchive -archivePath build/MyApp.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build
```

Then the archive is uploaded through Xcode's Organizer, Transporter, or
`fastlane pilot`, and appears in App Store Connect for TestFlight or review.

Important:

iOS release builds can only be produced on macOS. That is a hard constraint on CI
choices — you need macOS runners, or a cloud build service like EAS Build,
Bitrise, or Codemagic.

## 6. How Do Version Numbers Work On Each Platform?

Two numbers per platform, and they mean different things.

| | Android | iOS |
| --- | --- | --- |
| User-visible | `versionName` (`"1.4.0"`) | `CFBundleShortVersionString` |
| Internal | `versionCode` (integer) | `CFBundleVersion` (build number) |
| Rule | must strictly increase | must increase per upload |

The internal number is what the store uses to decide whether an upload is newer.
It must increase on **every upload**, including a build you re-upload after a
rejection. The user-visible version can stay the same across several builds.

```gradle
defaultConfig {
  versionCode 142
  versionName "1.4.0"
}
```

Interview note:

Teams usually automate this — deriving `versionCode` from the CI build number, or
using `fastlane increment_build_number` / EAS `autoIncrement`. Manually bumping
two numbers in two places is how you end up with a rejected upload at 6pm on a
Friday.

## 7. How Do You Ship Separate Dev, Staging, And Production Apps?

You want three apps installable side by side, each pointing at its own backend,
with its own name and icon so nobody files a bug against the wrong one.

**Android — product flavors:**

```gradle
flavorDimensions "env"
productFlavors {
  dev     { applicationIdSuffix ".dev";     resValue "string", "app_name", "MyApp Dev" }
  staging { applicationIdSuffix ".staging"; resValue "string", "app_name", "MyApp QA" }
  prod    { }
}
```

```bash
./gradlew assembleDevRelease
```

**iOS — schemes and configurations:** duplicate the Debug/Release configurations
per environment, set a different `PRODUCT_BUNDLE_IDENTIFIER` and display name for
each, and create a scheme per environment.

**Expo — build profiles** in `eas.json`, which is dramatically less work:

```json
{
  "build": {
    "staging": { "env": { "API_URL": "https://staging.api.com" } },
    "production": { "env": { "API_URL": "https://api.com" } }
  }
}
```

Important:

Build types (debug/release) and flavors/environments are **independent axes**.
"Debug versus release" is about optimization and bundling; "dev versus prod" is
about which backend and identity the app uses. You need a staging build compiled
in *release* mode to test what users will actually run.

## 8. What Is EAS Build And When Would You Use It?

EAS Build is Expo's hosted build service: it runs `eas build` on their
infrastructure, manages your signing credentials, and hands back an `.aab`/`.ipa`.

When to use it:

- You have no Mac, or not enough Macs for the team.
- You want signing credentials managed and shared rather than living on one
  developer's laptop.
- You want `eas submit` to push straight to TestFlight and Play, and `eas update`
  for OTA, as one pipeline.
- Your native config is expressible through `app.json` and config plugins, so
  `expo prebuild` can generate the native projects.

Tradeoff:

You pay per build beyond the free tier, queue times vary, and deeply customised
native projects can be awkward if you have hand-edited files that `prebuild`
would regenerate. Local builds (`eas build --local`) and bare workflows both
remain options.

## 9. What Is fastlane?

The long-standing automation toolkit for mobile release work, and what most
non-Expo teams run in CI. The pieces worth naming:

| Action | What it does |
| --- | --- |
| `match` | shares certificates and profiles via an encrypted git repo |
| `gym` | builds and exports a signed iOS archive |
| `pilot` | uploads to TestFlight and manages testers |
| `supply` | uploads to Google Play tracks |
| `screengrab` / `snapshot` | automates store screenshots per locale and device |

```ruby
lane :beta do
  increment_build_number
  match(type: "appstore")
  gym(scheme: "MyApp")
  pilot(skip_waiting_for_build_processing: true)
end
```

The value is that `fastlane beta` is one command that any teammate or CI runner
can execute identically — which is the real goal, not the tool itself.

## 10. How Do You Set Up CI/CD For A React Native App?

```viz
type: flow
title: A typical mobile pipeline
PR opened :: lint, typecheck, unit tests - fast, on Linux
Merge to main :: build staging artifacts for both platforms
Distribute :: TestFlight internal + Play internal track
Tag a release :: build production, upload, submit for review
Staged rollout :: 5% -> 20% -> 100%, watching crash-free rate
```

The mobile-specific concerns:

- **iOS needs macOS runners**, which are the expensive part. Run the cheap checks
  on Linux and only spend macOS minutes on actual builds.
- **Cache aggressively** — `node_modules`, CocoaPods, Gradle caches, and Hermes
  artifacts. An uncached React Native build is many minutes of pure re-download.
- **Secrets** — keystore, `.p12`, App Store Connect API key — go in the CI secret
  store, injected at build time. Use an App Store Connect **API key** rather than
  an Apple ID password, so 2FA does not block automation.
- **Do not build both platforms for every PR.** Gate full builds on merge or on a
  label.
- **Upload source maps** to your crash reporter as a pipeline step, or release
  traces are unreadable.

## 11. How Do You Get Builds To Testers?

**iOS — TestFlight:**

- *Internal testers*: up to 100 App Store Connect users, available within minutes,
  no review.
- *External testers*: up to 10,000, but the first build of a version needs Beta
  App Review.
- Builds expire after 90 days.

**Android — Play Console tracks:**

- *Internal testing*: up to 100 testers, available in minutes.
- *Closed testing*: named lists or Google Groups.
- *Open testing*: public opt-in beta.
- *Production*: everyone.

**Either platform — Firebase App Distribution** for ad-hoc builds to a device
list, which skips store processing entirely and is useful for quick QA on
Android and for iOS builds signed with an ad-hoc profile.

Interview note:

An app promoted from internal testing to production is the *same artifact* — you
promote the build rather than rebuilding it. Rebuilding for production is a
common process smell, because it means you ship something QA never tested.

## 12. How Do You Do A Staged Rollout And A Rollback?

**Android** supports percentage rollouts natively: release to 5%, watch, then
increase. You can **halt** a rollout, which stops further distribution, and you
can roll forward to a previous version code by uploading it as a new higher
version code.

**iOS** has *phased release* over 7 days for automatic updates, and you can pause
it. You can also remove a version from sale.

The constraint to state clearly:

Neither store gives you a true rollback. Users who already updated stay updated.
The real recovery paths are:

1. **Halt the rollout** immediately so no more users get it.
2. **Ship an OTA update** if the bug is in JavaScript — this is the fastest real
   fix and the main argument for having OTA configured before you need it.
3. **Expedited review** for a native fix on iOS.
4. **Server-side kill switch** or feature flag, which is why risky features should
   ship behind a flag rather than behind a release.

What you watch during a rollout: crash-free session rate per release, ANR rate on
Android, and your own error and conversion metrics — not store reviews, which
arrive far too late.

## 13. Why Do Native Builds Fail, And How Do You Debug Them?

The recurring causes:

- **Stale native state.** The first thing to try is a genuine clean:

  ```bash
  watchman watch-del-all
  rm -rf node_modules && npm install
  cd ios && rm -rf Pods Podfile.lock build && pod install
  cd ../android && ./gradlew clean
  npx react-native start --reset-cache
  ```

- **Pods out of sync** after adding a native dependency. `pod install` is not
  optional, and `pod repo update` is needed when a spec is not found.
- **Toolchain version mismatch** — wrong JDK for the Gradle version, Xcode too old
  for the iOS SDK, Node version, CocoaPods version. `npx react-native doctor` and
  `npx react-native info` catch most of these.
- **Duplicate classes or symbols** from two libraries pulling different versions
  of the same transitive native dependency. Resolve with a forced version or
  exclusion.
- **Architecture mismatch** on Apple Silicon — a pod built for the wrong slice, or
  needing `EXCLUDED_ARCHS` for simulator builds.
- **Missing New Architecture support** in a library, which fails at Codegen time
  rather than at runtime.

The method that matters:

Read the *first* error, not the last. Gradle and Xcode both print hundreds of
lines after the real failure, and people habitually debug the summary line
instead of the actual cause. On Gradle, `--stacktrace` and `--info` give you the
real message; in Xcode, expand the failing step in the report navigator.

## 14. How Do You Speed Up Native Build Times?

- **Build one architecture in development.** `ONLY_ACTIVE_ARCH` on iOS and
  `reactNativeArchitectures=arm64-v8a` in `gradle.properties` for local Android
  builds cut build time substantially — just never in a release build.
- **Enable the Gradle build cache and configuration cache**, and raise
  `org.gradle.jvmargs` so Gradle is not garbage collecting constantly.
- **Use prebuilt React Native artifacts** rather than building the framework from
  source, which is the default on recent versions unless you have opted into a
  source build.
- **ccache** for repeated C++ compilation, which is where New Architecture builds
  spend a lot of time.
- **Cache Pods and Gradle in CI**, keyed on the lockfiles.
- **Remote build caching** — EAS, Gradle Enterprise, or a shared cache bucket, so
  the team shares compilation work rather than each machine repeating it.
- **Trim native dependencies.** Every native library is compilation you pay for
  on every clean build.

## 15. What Do The App Stores Actually Reject?

The recurring reasons, which is what the question is really asking:

- **Privacy** — missing or inaccurate privacy policy, a Data Safety form or
  privacy nutrition label that does not match what the SDKs actually collect, or
  tracking without App Tracking Transparency consent on iOS.
- **Vague permission strings.** iOS `NSCameraUsageDescription` saying "we need
  camera access" is rejected; it must say what for.
- **Account deletion.** Both stores now require an in-app path to delete an
  account if the app can create one.
- **Payments.** Digital goods must use In-App Purchase or Play Billing; routing
  users to an external payment page is the classic rejection.
- **Broken or incomplete builds** — a demo account that does not work, a crash on
  the reviewer's device, or a feature that needs hardware the reviewer lacks.
- **Minimum SDK targets.** Both platforms enforce a target API level or SDK
  deadline each year, and old apps stop accepting updates.
- **Misleading metadata**, placeholder screenshots, or keyword stuffing.

Strong answer:

> Most rejections are process failures rather than code failures: privacy
> declarations that do not match the SDKs, permission strings that do not explain
> the use, no account deletion path, or a demo account that does not log in. I
> treat store compliance as a checklist item in the release runbook, and I keep a
> reviewer test account that CI verifies still works.

## 16. What Is In A Release Runbook?

```viz
type: flow
title: Release day
Cut a release branch :: freeze scope, bump version and build number
CI builds both platforms :: same artifacts that will ship
Source maps uploaded :: to Sentry/Crashlytics, per release
Distribute to testers :: TestFlight internal + Play internal track
Smoke test on fresh install :: login, core flow, push, deep link, offline
Submit for review :: with reviewer account and release notes
Staged rollout :: 5% -> 20% -> 100%, watching crash-free rate
Monitor and decide :: halt, OTA fix, or continue
```

The parts people forget: testing on a **fresh install** rather than an upgrade
over a dev build, verifying the production backend rather than staging, and
having the rollback decision made *before* the rollout — who can halt it, based on
which metric, at what threshold.
