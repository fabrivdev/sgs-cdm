# Welcome motion module — prepared, not mounted

Local work for `feat/campi-panorama-alternativa`, 2026-10-22. No component imports
this directory yet. No selector, preferences, data sources, SQL or existing rig
was changed. Figma design iteration is paused.

## APIs and ownership

`createWelcomeMotion(runtime, options)` accepts the existing `CampiController`
through the structural `WelcomeRuntime` interface. The future scene host owns the
controller, renderer, RAF, DOM and persistence. Use a fresh owned controller per
mount; do not attach to the current Panorama avatar's shared lifecycle.

- `start()` starts one greeting; `reentry: true` skips it and reveals a static selector.
- `prepare()` accepts the CTA from the first frame, even before `start()`. Repeated
  clicks coalesce. During the greeting it asks the existing runtime to stop and
  waits for its 320 ms fade to complete before changing context for the invitation.
- `update(dt)` replaces the host's call to `controller.update(dt)` in its existing
  render loop. Do not advance both. Render the returned controller model normally.
- `revealSelector(reducedMotion)` is a host callback returning `EntranceHandle`.
  The future host must make the selector wrappers available before returning a
  handle; mounting/layout stays outside this module. The invitation's real
  `inviting_palm_open` event triggers reveal (catalog progress .24), not a timer.
- `bindEnvironment(matchMedia('(prefers-reduced-motion: reduce)'), document)`
  handles system preference changes and tab visibility; bind before `start()`.
- `setPaused`, `setReducedMotion`, `dispose` support explicit host lifecycle.
  `AbortSignal` also disposes. After disposal the host must stop its RAF and dispose
  its runtime/renderer. This module does not own or replace their cleanup.

Existing runtime provides pose smoothing, grounded IK and varied automatic support
postures. No transforms are written to the character by this module. There are no
timeouts, intervals, audio, storage writes or global UI listeners. Optional browser
listeners are detached on disposal. Turning reduced motion off does not replay the
greeting or re-enable autonomous motion. On remount, pass `reentry` based on the
future flow's explicit state; this module deliberately does not persist it.

`playSelectorEntrance({ title, topics, priorities }, { signal, reducedMotion })`
animates only three dedicated UI wrappers with base opacity 1 and translate 0.
Never supply the CTA, layout-transform wrapper, `display: contents` group, or
character canvas. Animation cancellation reveals the base styles and removes all
animation effects; it does not change focus, pointer events or selection. The CTA
remains available and unanimated. WAAPI absence/failure falls back to static UI.
The `finished` promise settles even on cancellation. `finishReduced()` switches an
active entrance directly to its final static state. Parameters are centralized in
`SELECTOR_ENTRANCE` for later design adjustments.

## Verified design source and explicit product adaptation

Figma file `IkBozPmGN7IgABQz3ss2by`, node `27:208`, queried with design and motion
context on 2026-10-22. The export gives a 2000 ms looping preview with these tracks:

| Wrapper | Node | Delay | Motion end | Values |
|---|---|---:|---:|---|
| title | 27:209 | 0 ms | 280 ms | opacity 0→1, translateY 12→0 px |
| topics | 27:223 | 80 ms | 360 ms | same |
| priorities | 27:242 | 160 ms | 440 ms | same |

Each moving segment is 280 ms, `ease-out`, confirmed by the designer as
`cubic-bezier(0, 0, 0.58, 1)`. Shared document timeline start coordinates the three
Web Animations. The explicit product requirement makes this a single entrance,
omitting the preview's final static hold and infinite repetition. No easing or
movement was inferred for the CTA. Reduced node `27:319` returns no animated nodes;
the reduced path creates no animations or delayed timers.

## Ready versus pending

Prepared: orchestration of existing `personalidad-02` greeting and
`personalidad-12` invitation (both authored at 3.8 s), varied idle from the runtime,
safe early/repeated clicks, UI reveal and one-shot entrance, interruption,
visibility, reduced motion and reentry. A rejected/missing recipe is reported via
`onIssue` and does not block UI progression. UI reveal errors are reported rather
than claiming successful mounting.

Prepared additionally: opt-in articulated walking, stepping turns, braking and
lateral travel in `public/campi3d/controller/locomotion.mjs`. It extends the existing
runtime, reusing its mixer, pose springs and support IK. The current app still uses
the original controller. See the integration contract below.

Pending: final 2-3 s intro editing, production contact-shadow scene composition,
React/factory mounting and artistic acceptance of the final choreography. The
existing greeting alone lasts 3.8 s; a full walk + turn + greeting must not be
advertised as a 2-3 s entrance. Current catalog recipes remain
`authored_unvalidated` for artistic acceptance even when technical tests pass.
The new attached image also received 403 scope_violation in the designer's
environment; image transfer is stopped and not a prerequisite for this module.

## Verification

Run `node node_modules/vitest/vitest.mjs run src/components/campi3d/welcome-motion`.
Tests use the actual GLB/controller to check sequencing, interruption, grounded
support and bounded per-frame pelvis motion, plus unit tests of animation cleanup
and browser listeners. They do not certify final visual choreography or deployment.

## Opt-in locomotion contract

Instantiate `CampiLocomotionController(gltf, options)` instead of the base controller
only in the future dedicated welcome scene. The model remains the current GLB,
SHA256 `bbd10aba2f3ee52c918f801399fc3366fe787e35e3f241064b965a7ecb8e7a48`.
No embedded clips, recipe registry, browser factory or current avatar were edited.

- `place({ x, z, yaw })`: initial placement before the first update only.
- `startLocomotion(segments)`: validates the whole route before starting; returns
  `{ started, status, token }`. Each segment is `walk`, `side-step` or `turn`.
  `to: [x,z]` is an absolute ground destination in model-parent coordinates, `yaw`
  is radians. Forward walking follows the current heading; lateral travel is
  perpendicular. Turns use alternating foot placement, not a pivot on fixed boots.
- `duration` is optional per segment. Defaults account for distance, step cadence,
  peak linear velocity 0.8 units/s and peak turn rate 1.3 radians/s. Too-short
  durations are rejected. Split travel over 3 units or turns over 90 degrees.
- Model scale must be one and model y must be zero. Scale the whole scene parent
  consistently if needed; no terrain, slope, collisions or obstacle avoidance.
- `stopLocomotion(reason)` removes pending segments, finishes the active swing and
  closes the feet while braking from current position/velocity/acceleration. It is
  asynchronous and idempotent; advance until `snapshot().locomotion` is null.
- `setReducedMotion(true)` freezes root travel immediately and uses the existing
  safe landing for a raised foot. It does not resume when switched off. Its held
  supports are intended for grounded welcome gestures, not jumping recipes.
- `snapshot()` adds `locomotion` and `lastLocomotion`. `dispose()` clears the route;
  the host still stops RAF and disposes renderer/resources. No timers or audio.

Root motion drives the articulated rig, with fixed support anchors in parent space,
IK at each substep, C2 foot lift curves, pelvis weight shift and opposite arm swing.
The side-step lead opens the stance and the trailing foot closes it without crossing.
This is procedural locomotion, not new GLB animation clips or CSS translation.

Pass `locomotion: { entry: [...], toSelector: [...] }` to `createWelcomeMotion`.
Entry completes before greeting; an early click brakes and proceeds to invitation.
The selector reveals at the actual invitation event, remains interactive, and
optional travel starts after the gesture. Reentry/reduced motion skip both routes.
Distances are explicit scene choices; the coordinator does not infer DOM positions.
Do not start recipes and locomotion simultaneously: the extension returns busy.

## Reproducible isolated browser check

`scripts/campi-motion/scene.html` is a test fixture with the real GLB, floor and
contact shadows. It is not an app route. The runner intercepts all requests and
serves only local fixture/Campi files; it does not connect to the user's app/browser.

Run `node scripts/campi-motion/headless-review.cjs <absolute-output-directory>`.
It requires an available Playwright install and its headless Chromium. Set
`CAMPI_PLAYWRIGHT_MODULE` and `CAMPI_HEADLESS_EXECUTABLE` to existing local paths if
they are not installed in this repo. No installation or persistent browser profile
is performed. It captures front, three-quarter and side views of walking, turning,
lateral steps and braking, and checks the complete welcome sequence in WebGL.
`verification.json` records errors, phases, reveal count and capture filenames.

The 33 unit/integration cases include the real GLB at different frame rates,
contact/slip/sole clearance/reach/joint continuity, cancellation at six times,
side/turn cancellation, reduced motion, pause, reentry, early/repeated clicks and
listener/animation cleanup. The long idle test has a 20 s CPU budget because it
simulates more than 33 seconds of the actual rig. Run with `--maxWorkers=1` on
resource-constrained hosts. This is scoped verification, not a whole-app build.


Actualización 28/10: montado localmente por CampiOnboardingScene mediante la opción welcome de browserFactory. La descripción anterior de módulo no montado corresponde al estado previo. Reduced motion puede conservar la bienvenida estática hasta CTA.


Corrección de duración: welcome-recipes.mjs genera copias exclusivas de esta escena (un saludo breve de 1,1 s y una invitación de 1,2 s, amplitudes menores, sin timeScale). La caminata mantiene su velocidad y freno: entrada total medida con GLB real 2,90 s a 30 fps y 2,883 s a 60 fps. El selector se revela al CTA y su entrada escalonada termina en 440 ms; el gesto y frenado no bloquean navegación. El cambio de composición dura 400 ms, sin transición en movimiento reducido. Sustituye el límite de duración documentado anteriormente; duración medida desde inicio del runtime, no incluye descarga inicial del modelo.
