# PIXI_V8_NOTES – was gegenüber v7 anders ist (für Rascal Rock Lockup)

Quelle: https://pixijs.com/8.x/guides/migrations/v8 (abgerufen 2026-11-04).
Wo der Leitfaden nichts sagt (`preference`, `BitmapFont.install`, Kontextverlust, Blend-Mode-Liste), habe ich gegen die **installierte `pixi.js@8.22.0`** (`node_modules/pixi.js/lib/*.d.ts` / `*.mjs`) geprüft. Diese Stellen sind mit **[8.22-Quelltext]** markiert.

## 1. Paket und Imports
- Es gibt nur noch ein Paket: `import { Application, Sprite } from 'pixi.js'`, keine `@pixi/*`-Pakete mehr.
- Diese Extensions sind standardmäßig enthalten: accessibility, app, events, filters, sprite-tiling, text, text-bitmap, text-html, graphics, mesh, sprite-nine-slice.
- **Manuell importieren** (Side-Effect-Import): `pixi.js/advanced-blend-modes`, `pixi.js/unsafe-eval`, `pixi.js/prepare`, `pixi.js/math-extras`, `pixi.js/dds`, `pixi.js/ktx`, `pixi.js/ktx2`, `pixi.js/basis`.
- `app.init({ manageImports: false })` schaltet die Auto-Imports ab. Das spart Bundle-Größe, dann muss man aber alles selbst importieren.
- Wer Bitmap-Fonts (`.fnt`) **vor** `app.init()` per `Assets.load` laden will, braucht `import 'pixi.js/text-bitmap'`.
- `utils` gibt es nicht mehr, alles wird direkt importiert: `import { isMobile } from 'pixi.js'`.
- `settings` gibt es nicht mehr, stattdessen `AbstractRenderer.defaultOptions.resolution = 1` usw. oder die Option direkt an `init`.

## 2. Application: asynchrone Initialisierung und Renderer-Wahl
```ts
import { Application } from 'pixi.js';

const app = new Application();              // Optionen NICHT mehr in den Konstruktor
await app.init({
  preference: ['webgl'],                     // Array = Whitelist. Siehe Gotcha unten!
  powerPreference: 'low-power',
  resizeTo: hostEl,                          // window oder ein HTMLElement
  resolution: Math.min(devicePixelRatio, 2), // Standard ist 1!
  autoDensity: true,                         // CSS-Größe = logische Größe
  antialias: false,
  background: '#7fb7c9',
  // autoStart: true, sharedTicker: false (Standardwerte)
});
hostEl.appendChild(app.canvas);              // app.view ist veraltet → app.canvas
```
- **Gotcha `preference` [8.22-Quelltext]:** Ein *String* (`preference: 'webgl'`) setzt WebGL nur an die erste Stelle. Danach versucht Pixi **WebGPU und dann den Canvas-Renderer** (`renderPriority = ['webgl','webgpu','canvas']`). Für „kein WebGPU“ (BRIEF 9.6) ist deshalb **`preference: ['webgl']`** nötig. Ein Array ist eine Whitelist („Any renderer type not in the array is excluded entirely“). Ist WebGL nicht verfügbar, wirft `init` dann `Error('No available renderer for the current environment')`. Diesen Fehler fangen und den freundlichen Hinweis zeigen.
- `RendererPreference = 'webgl' | 'webgpu' | 'canvas'`. In 8.22 gibt es wieder einen Canvas-Renderer.
- Der Renderer-Code wird **dynamisch importiert** (`await import('./gl/WebGLRenderer.mjs')`), es entsteht also ein eigener Chunk. In Vite braucht es deshalb `base: './'`, damit der Chunk auch unter dem CrazyGames-Unterpfad relativ geladen wird.
- `resolution` ist standardmäßig **1**. Ohne `resolution`/`autoDensity` wird auf HiDPI alles unscharf.
- Typisierung: `new Application<Renderer<HTMLCanvasElement>>()` bzw. `WebGLRenderer<…>`.

## 3. Graphics-API (die größte Änderung)
Erst die Form bauen, dann `fill()`/`stroke()`. „Line“ heißt jetzt „Stroke“.
```ts
// v7: new Graphics().beginFill(0xff0000).drawRect(50,50,100,100).endFill();
const g = new Graphics()
  .rect(50, 50, 100, 100).fill(0xff0000)
  .roundRect(0, 0, 80, 40, 10).fill({ color: 0xffff00, alpha: 0.5 })
  .rect(0, 0, 100, 100).stroke({ width: 2, color: 'white' });

// Loch: cut() wirkt auf die vorherige Form
const donut = new Graphics().rect(0, 0, 100, 100).fill(0x00ff00).circle(50, 50, 20).cut();

// Textur-Füllung (ersetzt beginTextureFill / lineTextureStyle)
g.rect(0, 0, 100, 100).fill({ texture: Texture.WHITE, color: 0xff0000, alpha: 0.5 });

// Geteilte Geometrie: GraphicsContext statt GraphicsGeometry
const ctx = new GraphicsContext().rect(0, 0, 16, 16).fill(0x000000);
const a = new Graphics(ctx), b = new Graphics(ctx);
```
Umbenennungen: `drawRect→rect`, `drawCircle→circle`, `drawEllipse→ellipse`, `drawPolygon→poly`, `drawRoundedRect→roundRect`, `drawRegularPolygon→regularPoly`, `drawRoundedPolygon→roundPoly`, `drawRoundedShape→roundShape`, `drawStar→star`, `drawChamferRect→chamferRect`, `drawFilletRect→filletRect`. `beginHole/endHole` → `cut()`.
Für uns: Graphics nur für Debug-Overlays, Bau-Rechteck und Auswahlrahmen. Kein Zeichnen pro Frame (BRIEF 9.6). Wenn nötig, `clear()` und neu aufbauen, nur bei Änderung.

## 4. Text, BitmapText, BitmapFont
Konstruktoren nehmen **ein Options-Objekt**:
```ts
// v7: new Text('Hello', style)
const t  = new Text({ text: 'Hello', style: { fontFamily: 'Fredoka', fontSize: 24, fill: 0xffffff } });
const bt = new BitmapText({ text: '+120', style: { fontFamily: 'RRL-Num', fontSize: 28 } });
const ht = new HTMLText({ text: '<b>Hi</b>', style });
```
**BitmapFont.install [8.22-Quelltext]:** `static install(options: BitmapFontInstallOptions): void`, Optionen `{ name?, chars?, resolution? (=1), padding? (=4), skipKerning? (=false), style?, textureStyle? }`.
```ts
await document.fonts.load('700 32px Fredoka');   // Webfont MUSS geladen sein, sonst wird Fallback-Font gebacken
BitmapFont.install({
  name: 'RRL-Num',                                // dann style.fontFamily: 'RRL-Num' in BitmapText
  chars: [['0', '9'], '+-−×.,:%/ kKmMbB'],         // Leerzeichen nicht vergessen!
  resolution: Math.min(devicePixelRatio, 2),      // Auflösung HIER setzen, nicht am BitmapText
  padding: 4,
  style: { fontFamily: 'Fredoka', fontWeight: '700', fontSize: 48, fill: 0xffffff,
           stroke: { color: 0x3b2a1a, width: 6 } },
});
// BitmapFont.uninstall('RRL-Num') beim Neuaufbau
```
- **Gotcha:** BitmapText erzeugt **dynamisch** einen Bitmap-Font, wenn `fontFamily` kein installierter Name ist. Ein Tippfehler im Namen fällt deshalb nicht auf: Es wird still ein zweiter Font mit System-Fallback gebacken. Den Namen als Konstante führen.
- Umbenannte Text-Parser: `TextFormat→bitmapFontTextParser`, `XMLStringFormat→bitmapFontXMLStringParser`, `XMLFormat→bitmapFontXMLParser`.

## 5. Container, Sprite, Szenengraph
- `DisplayObject` gibt es nicht mehr. **`Container`** ist die Basisklasse.
- **Leaf-Nodes haben keine Kinder mehr** (veraltet): Sprite, Graphics und Mesh dürfen keine `addChild` mehr bekommen. Gruppen bildet man mit einem `Container`, z. B. für Rascal + Schatten + Icon.
- `container.name` → **`container.label`**.
- `getBounds()` liefert `Bounds`, das Rechteck kommt über `getBounds().rectangle`.
- `cacheAsBitmap = true` → **`cacheAsTexture(true)`** (laut BRIEF 9.6 nicht für den Boden verwenden).
- `updateTransform()` gibt es nicht mehr. Logik pro Frame kommt nach **`onRender`** (`this.onRender = () => {…}`). Bei uns besser zentral im Ticker.
- Sprites merken **nicht** mehr, wenn sich UVs oder `frame` einer Textur ändern. Nach `texture.frame…; texture.update()` muss `sprite.onViewUpdate()` folgen. Besser: Texturen nie mutieren, sondern zwischen fertigen Frame-Texturen wechseln (`sprite.texture = frames[i]`).
- `NineSlicePlane` → `NineSliceSprite({ texture, leftWidth, topHeight, rightWidth, bottomHeight })`. `TilingSprite` (der Leitfaden schreibt im Beispiel fälschlich `TileSprite`, die Klasse heißt in 8.22 `TilingSprite`) nimmt ebenfalls `{ texture, width, height }`.
- Mesh: `SimpleMesh→MeshSimple`, `SimplePlane→MeshPlane`, `SimpleRope→MeshRope`. `new Mesh({ geometry, shader, texture })`.
- **Events:** Standard-`eventMode` ist jetzt `'passive'` (vorher `'auto'`). Interaktive Objekte brauchen `eventMode = 'static'`. Bei uns läuft Input ohnehin über den Stage-/Canvas-Handler und das DOM-HUD. Agenten bleiben `'none'`, das spart Hit-Tests.

## 6. Texturen und Assets
- `BaseTexture` gibt es nicht mehr. An seiner Stelle stehen **`TextureSource`**-Varianten (`ImageSource`, `CanvasSource`, `VideoSource`, `BufferSource`, `CompressedSource`). Texturen laden nichts mehr selbst.
- **`Texture.from(url)` lädt nicht mehr.** Erst `await Assets.load(url)`, danach `Texture.from(url)` oder direkt den Rückgabewert nutzen.
- `Assets.add('bunny', 'bunny.png')` → **`Assets.add({ alias: 'bunny', src: 'bunny.png' })`**.
- Mipmaps: `mipmap` → **`autoGenerateMipmaps`**. RenderTextures erzeugen ihre Mipmaps nicht mehr automatisch, dafür gibt es `rt.source.updateMipmaps()`.
- `SCALE_MODES.NEAREST/LINEAR` → `'nearest'` / `'linear'`. `WRAP_MODES` → `'clamp-to-edge'`, `'repeat'`, `'mirror-repeat'`. `DRAW_MODES` → `'triangle-list'` usw.
```ts
await Assets.load([
  { alias: 'atlas0', src: 'assets/atlas/atlas0.json' },   // relativ! (CrazyGames)
]);
const sheet = Assets.get('atlas0');            // Spritesheet; Frames über sheet.textures['floor_a.png']
const floor = new Sprite(sheet.textures['floor_a.png']);
// Hintergrund-Nachladen nach gameplayStart: Assets.backgroundLoad(...) / Assets.loadBundle(...)
```

## 7. Ticker
Der Callback bekommt den **Ticker**, nicht mehr `dt`:
```ts
app.ticker.add((ticker) => {
  // ticker.deltaTime = Frames (skaliert), ticker.deltaMS = ms (gedeckelt, skaliert), ticker.elapsedMS = ms (roh)
  sim.advance(ticker.elapsedMS);   // eigener Fixed-Step-Akkumulator (BRIEF 9.4), unabhängig von 60/144/165 Hz
});
```
Für einen Hintergrund-Tab `app.ticker.stop()` / `start()` aufrufen (BRIEF 9.6).

## 8. Blend Modes [8.22-Quelltext]
- Blend Modes sind **Strings** (`sprite.blendMode = 'add'`).
- **Ohne Import** (native GL-Blend-States, batch-freundlich): `normal`, `add`, `multiply`, `screen`, `erase`, `none`, `normal-npm`, `add-npm`, `screen-npm`, `min`, `max`.
- **Nur mit `import 'pixi.js/advanced-blend-modes'`**: `color`, `color-burn`, `color-dodge`, `darken`, `difference`, `divide`, `exclusion`, `hard-light`, `hard-mix`, `lighten`, `linear-burn`, `linear-dodge`, `linear-light`, `luminosity`, `negation`, `overlay`, `pin-light`, `saturation`, `soft-light`, `subtract`, `vivid-light`.
- Die Advanced-Modi sind `BlendModeFilter`-Unterklassen und laufen über `FilterEffect` [8.22-Quelltext]. [Einschätzung] Sie brechen damit das Batching und kosten Fillrate. Für die Abendstimmung besser einen `multiply`-Overlay-Sprite nehmen (nativ), kein `overlay`/`soft-light`.

## 9. Culling (nicht mehr automatisch!)
```ts
import { Culler, CullerPlugin, extensions, Rectangle } from 'pixi.js';

chunk.cullable = true;                       // pro 16×16-Boden-Block-Container
chunk.cullArea = new Rectangle(x, y, w, h);  // fixe Fläche statt Bounds-Berechnung (billiger)
chunk.cullableChildren = false;              // Kinder einzeln nicht prüfen

// Variante A: manuell pro Frame, gegen den Kamera-Ausschnitt
Culler.shared.cull(world, viewRect);
// Variante B: altes Verhalten (cullt jedes Frame gegen renderer.screen)
extensions.add(CullerPlugin);
```
Gotcha: In v8 ist `cullable` ohne `Culler.shared.cull(...)` oder `CullerPlugin` **wirkungslos**.

## 10. ParticleContainer (für Konfetti, Staub, Coins)
- Er nimmt keine Sprites mehr, sondern **`Particle`** (oder Objekte nach `IParticle`: `x, y, scaleX, scaleY, anchorX, anchorY, rotation, color, texture`).
- `container.addParticle(p)` / `removeParticle(p)`. Die Partikel liegen in `particleChildren` (flaches Array), nicht in `children`.
- Er berechnet **keine Bounds**. Dafür `new ParticleContainer({ boundsArea: new Rectangle(…) })` setzen, sonst gibt es Ärger mit Culling und Hit-Tests.
- Das passt zu den Pools aus BRIEF 9.6: Partikel-Objekte wiederverwenden, keine Allokation pro Frame.

## 11. Filter und Shader (nur falls nötig)
- `new Filter({ glProgram: GlProgram.from({ vertex, fragment }), resources: { u: { uTime: { value: 0, type: 'f32' } } } })`.
- Uniforms brauchen jetzt einen `type`. Texturen sind *Resources*, keine Uniforms mehr.
- Eingebaute Filter nehmen Options-Objekte: `new BlurFilter({ blur: 8, quality: 4 })`.
- Community-Filter: `import { AdjustmentFilter } from 'pixi-filters/adjustment'` (die `@pixi/filter-*`-Pakete sind tot).

## 12. WebGL-Kontextverlust [8.22-Quelltext]
- `GlContextSystem` registriert selbst `webglcontextlost` (mit `event.preventDefault()`, damit ein Restore möglich ist) und `webglcontextrestored`. Beim Restore wird `renderer.runners.contextChange` ausgelöst, und GPU-Ressourcen werden beim nächsten Render neu angelegt.
- `renderer.context.isLost` (Getter) zum Abfragen, `renderer.context.forceContextLoss()` zum Testen.
- Für BRIEF 9.6 („Atlas neu hochladen, Ladebalken zeigen“): Eigene Listener auf `app.canvas` **zusätzlich** registrieren, nur für die UI (Overlay ein/aus, Ticker pausieren). Kein eigenes `preventDefault`-Duplikat und kein manuelles Re-Upload, solange die Texturen aus `Assets` stammen. Mit `forceContextLoss()` in Playwright testen.

## 13. Kurz-Checkliste für den Code-Review
- [ ] Kein `new Application({...})` mit Optionen, immer `await app.init({...})`.
- [ ] `preference: ['webgl']` (Array!) und der Fehlerfall wird gefangen.
- [ ] `resolution` + `autoDensity` gesetzt.
- [ ] Kein `beginFill/drawRect/lineStyle`.
- [ ] Kein `new Text('…', style)` und kein `new BitmapText('…', style)`.
- [ ] `document.fonts.load` vor `BitmapFont.install`. Font-Name als Konstante.
- [ ] Kein `addChild` an Sprite/Graphics.
- [ ] `label` statt `name`.
- [ ] Kein `Texture.from(url)` ohne vorheriges `Assets.load`.
- [ ] Ticker-Callback nutzt `ticker.deltaMS`/`elapsedMS`.
- [ ] Culling wird ausdrücklich aufgerufen.
- [ ] Advanced Blend Modes nur mit Import (am besten gar nicht).
- [ ] Vite `base: './'` (dynamischer Renderer-Chunk).
