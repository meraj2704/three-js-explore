"use client";

import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";

import { Car } from "./Car";
import { ChaseCamera } from "./ChaseCamera";
import { Gate } from "./Gate";
import { JunctionApron } from "./JunctionApron";
import { Museum, defaultMuseumGeometry } from "./Museum";
import type {
  Exhibit,
  GalleryItem,
  MuseumGeometry,
  MuseumPortrait,
  MuseumTheme,
} from "./Museum";
import { stackExhibits } from "./stackExhibits";
import { Road } from "./Road";
import { Roadside } from "./Roadside";
import { SceneFog } from "./SceneFog";
import { StreetLamps } from "./StreetLamps";
import {
  BRANCH_LENGTH,
  BRANCH_WIDTH,
  BRANCH_Z,
  HALL_HALF_DEPTH,
  HALL_HALF_Z,
  MUSEUM_CENTER_X,
  MUSEUM_CENTER_Z,
  RIGHT_APRON_FAR_X,
  RIGHT_APRON_NEAR_X,
  RIGHT_BRANCH_Z,
  RIGHT_MUSEUM_CENTER_X,
  RIGHT_MUSEUM_CENTER_Z,
  RIGHT_MUSEUM_GROUNDS_ENTER_X,
  RIGHT_MUSEUM_GROUNDS_EXIT_X,
  ROAD_START_Z,
  ROAD_SURFACE_Y,
  ROAD_WIDTH,
} from "./worldGeometry";

/** Camera seat once the car is on museum grounds: shorter and higher than the
 *  road seat, so it ducks through the doorway with the car instead of being
 *  left outside staring at the facade. The swap happens a whole forecourt
 *  early, which is the run-up the easing needs to be seated by the threshold.
 *
 *  It stays higher than the car's roof, which is what keeps the corner cases
 *  out of the bodywork: backed against a wall the seat below gets clamped to
 *  within a metre, and from there the camera looks down at the roof rather than
 *  sitting inside it. */
const INDOOR_CHASE_OFFSET: [number, number, number] = [0, 2.5, -4.8];

/** Which museum the car is inside. A single value, not a flag per building: the
 *  camera has to know WHICH hall to fence itself into, and a pair of booleans
 *  could contradict each other. */
type MuseumId = "left" | "meraj";

/** Walls the indoor seat may not cross: the hall floor, inset a little.
 *
 *  The floor and not the room, even though the room is bigger and the extra
 *  travel would help in the corners. Beyond the floor are the plinths, and a
 *  seat allowed over one ends up inside a display case — which looks far worse
 *  than a close camera does. The wall with the doorway in it is left unfenced on
 *  purpose, since clamping the way the car came in would shove the camera past
 *  it on the threshold — which is why the two entries below fence opposite ends
 *  of x: these buildings face each other. Defined out here so each entry's
 *  object identity is stable across renders. */
const HALL_CAMERA_BOUNDS: Record<
  MuseumId,
  { minX?: number; maxX?: number; minZ: number; maxZ: number }
> = {
  left: {
    minX: MUSEUM_CENTER_X - HALL_HALF_DEPTH + 0.3,
    minZ: MUSEUM_CENTER_Z - HALL_HALF_Z + 0.3,
    maxZ: MUSEUM_CENTER_Z + HALL_HALF_Z - 0.3,
  },
  meraj: {
    maxX: RIGHT_MUSEUM_CENTER_X + HALL_HALF_DEPTH - 0.3,
    minZ: RIGHT_MUSEUM_CENTER_Z - HALL_HALF_Z + 0.3,
    maxZ: RIGHT_MUSEUM_CENTER_Z + HALL_HALF_Z - 0.3,
  },
};

/** The Meraj Museum's placement. Everything else — depth, height, door, plinths,
 *  forecourt — is spread in from the defaults, so the two buildings can only
 *  differ where this object says they do, and isOnPavement's mirrored tests keep
 *  reading the same shared constants.
 *
 *  Module-level for identity, not tidiness: <Museum> memoises its entire derived
 *  layout on this object, and an inline literal would rebuild it every render. */
const MERAJ_MUSEUM_GEOMETRY: MuseumGeometry = {
  ...defaultMuseumGeometry,
  centerX: RIGHT_MUSEUM_CENTER_X,
  centerZ: RIGHT_MUSEUM_CENTER_Z,
  groundsEnterX: RIGHT_MUSEUM_GROUNDS_ENTER_X,
  groundsExitX: RIGHT_MUSEUM_GROUNDS_EXIT_X,
};

/** The same laboratory, wired violet.
 *
 *  Two identical buildings at the ends of two identical branches would leave a
 *  driver unsure which one they had arrived at, so one of them has to differ —
 *  and when both are near-black, the ONLY thing left to differ in is the light.
 *  That is why every override below is an emissive colour and not one structural
 *  grey: the walls, floors and metal are shared deliberately, so the two halls
 *  read as one building programme with two installations in it rather than as two
 *  unrelated buildings.
 *
 *  It swaps the palette's two accents rather than introducing a third hue. The
 *  brief allows purple in small amounts; this is the room where the small amount
 *  is the main one, and cyan becomes the trim. */
const MERAJ_MUSEUM_THEME: Partial<MuseumTheme> = {
  accent: "#a78bfa",
  accentAlt: "#22d3ee",
  holo: "#8b5cf6",
  stripEmissive: "#a78bfa",
  strip: "#ece6ff",
  sign: "#c4b5fd",
  signOutline: "#2e1065",
  exhibitLeftColor: "#ddd6fe",
  exhibitLeftEmissive: "#6d28d9",
  exhibitRightColor: "#a5f3fc",
  exhibitRightEmissive: "#0e7490",
  artworkPanelEmissive: "#5b21b6",
  panelAccent: "#a78bfa",
  light: "#c9c0ff",
};

/** The face at the centre of the first hall — shown on a working display rather
 *  than in a frame, which is what the rest of these fields are for. `role` and
 *  `status` are the two that matter: a portrait captioned with nothing but a name
 *  reads as a memorial, and a present-tense line is what tells a visitor this is
 *  somebody's profile and not somebody's plaque.
 *
 *  `aspect` is the SOURCE file's, not the display's: mahfuz.jpeg is a square
 *  200×200 headshot, so 1 mats it correctly. Give it the wrong number here and
 *  the picture stretches rather than complains.
 *
 *  Module-level like everything else the museum memoises on. Its footprint is cut
 *  out of the drivable floor by MUSEUM_HAS_PORTRAIT in worldGeometry. The Meraj
 *  museum has no photo yet and no hole to match — drop one in public/, add the
 *  twin of this object, and flip RIGHT_MUSEUM_HAS_PORTRAIT alongside it. */
export const MAHFUZ_PORTRAIT: MuseumPortrait = {
  src: "/mahfuz.jpeg",
  caption: "MAHFUZ ISLAM",
  role: "FULL-STACK DEVELOPER",
  status: "Currently shipping",
  tags: ["NEXT.JS", "NESTJS", "POSTGRES", "PRISMA", "REDIS", "DOCKER"],
  aspect: 1,

  /* Everything below is what the back wall's monitor shows. It is all data —
   * the monitor owns every decision about where a number goes and how big it
   * is, and this object owns nothing but what the numbers ARE. Which is the
   * point: rewriting a CV should never mean touching a layout. */
  about:
    "Full-stack developer building modern, scalable, high-performance web applications end to end.",
  availability: "AVAILABLE FOR NEW OPPORTUNITIES",
  stats: [
    { value: "5+", label: "YEARS EXPERIENCE" },
    { value: "30+", label: "PROJECTS COMPLETED" },
    { value: "10+", label: "HAPPY CLIENTS" },
  ],
  /* Seven, and seven is deliberate: the monitor deals these four across then
   * three, so six would leave an even grid with nothing to look at and eight
   * would need a third row it does not have the height for. */
  tech: [
    "NEXT.JS",
    "REACT",
    "TYPESCRIPT",
    "NODE.JS",
    "MONGODB",
    "REDUX",
    "TAILWIND",
  ],
  skills: [
    { label: "FRONTEND DEVELOPMENT", level: 95 },
    { label: "BACKEND DEVELOPMENT", level: 90 },
    { label: "UI/UX DESIGN", level: 80 },
    { label: "DATABASE MANAGEMENT", level: 85 },
    { label: "DEVOPS & DEPLOYMENT", level: 75 },
  ],
  achievements: [
    { value: "30+", label: "PROJECTS", icon: "project" },
    { value: "20+", label: "CLIENTS", icon: "client" },
    { value: "10+", label: "TECHNOLOGIES", icon: "tech" },
    { value: "5+", label: "AWARDS", icon: "award" },
  ],
  focus: {
    text: "Building scalable web applications with modern technologies",
    progress: 0.85,
  },

  /* ---------------------------------------------------------------- *
   * And what each of those panels opens onto.
   * ---------------------------------------------------------------- *
   * Everything above is a SUMMARY, read from a car at the far end of the hall.
   * Everything below is only ever seen after somebody has walked up and clicked
   * something, which is why it is allowed to be longer, and why it is separate
   * fields rather than longer versions of the ones above: a detail view that
   * shows the same eight words at twice the size is a zoom, not a mode.
   */
  philosophy:
    "Ship small, measure everything, and keep the boring parts boring. Most of what makes an application fast is a decision taken before any of it is written.",
  timeline: [
    { year: "2020", label: "First production work" },
    { year: "2022", label: "Full-stack, end to end" },
    { year: "2023", label: "Leading delivery" },
    { year: "2025", label: "Systems and scale" },
  ],
  /* Grouped for the TECH STACK graph. The groups ARE the argument that view
   * makes — a stack is not seven logos, it is four concerns wired together. */
  techGroups: [
    { label: "FRONTEND", items: ["NEXT.JS", "REACT", "REDUX", "TAILWIND"] },
    { label: "LANGUAGE", items: ["TYPESCRIPT"] },
    { label: "BACKEND", items: ["NODE.JS", "REST", "AUTH"] },
    { label: "DATA", items: ["MONGODB", "CACHING"] },
  ],
  milestones: [
    { year: "2021", label: "First client shipped" },
    { year: "2022", label: "10 projects" },
    { year: "2024", label: "20 clients" },
    { year: "2025", label: "30 projects" },
  ],
  learning: ["RUST", "EDGE RUNTIMES", "OBSERVABILITY"],

  /* Placeholder work, in the same spirit as the empty frames on the side walls:
   * the rail is real and wired, the prints have not arrived. Replace these with
   * actual projects — every field is optional, so a half-filled entry renders
   * as a half-filled case study rather than as a hole. */
  projects: [
    {
      name: "COMMERCE PLATFORM",
      summary:
        "A storefront and admin system handling catalogue, checkout and fulfilment for a multi-region retailer.",
      tech: ["NEXT.JS", "NODE.JS", "MONGODB", "REDUX"],
      architecture:
        "Server-rendered storefront over a REST core, with the catalogue read model kept warm in cache and writes routed through a single ordering service.",
      challenge:
        "Checkout stalled under campaign traffic because every page read priced the basket from source.",
      solution:
        "Moved pricing to a precomputed read model invalidated on write; p95 checkout fell from seconds to well under one.",
      features: [
        "Multi-region catalogue",
        "Server-rendered product pages",
        "Role-based admin",
        "Order and fulfilment tracking",
      ],
      demo: "example.com",
      repo: "github.com/example",
      stats: [
        { value: "98", label: "LIGHTHOUSE" },
        { value: "92", label: "TEST COVERAGE" },
      ],
    },
    {
      name: "ANALYTICS DASHBOARD",
      summary:
        "A realtime operations dashboard aggregating event streams into a small number of readable indicators.",
      tech: ["REACT", "TYPESCRIPT", "NODE.JS"],
      architecture:
        "A streaming aggregator writing rolling windows, and a thin client that only ever reads the windows.",
      challenge:
        "The first build queried raw events per widget and fell over at a few thousand events a minute.",
      solution:
        "Pushed aggregation upstream of the client entirely; the browser now reads fixed-size summaries at any volume.",
      features: ["Realtime rollups", "Custom indicators", "Historic replay"],
      demo: "example.com",
      repo: "github.com/example",
      stats: [
        { value: "60", label: "FRAME RATE" },
        { value: "88", label: "TEST COVERAGE" },
      ],
    },
    {
      name: "TEAM WORKSPACE",
      summary:
        "Shared documents, tasks and presence for distributed teams, with conflict-free concurrent editing.",
      tech: ["NEXT.JS", "TYPESCRIPT", "MONGODB", "TAILWIND"],
      architecture:
        "Documents held as ordered operations, merged on the server and broadcast to connected clients.",
      challenge: "Concurrent edits produced divergent documents across clients.",
      solution:
        "Replaced last-write-wins with an operation log and deterministic merge; divergence became structurally impossible.",
      features: ["Live presence", "Offline edits", "Granular permissions"],
      demo: "example.com",
      repo: "github.com/example",
      stats: [{ value: "95", label: "UPTIME" }],
    },
  ],
};

/** The project wall. Hung but not yet filled: every slot below is a mounted
 *  empty frame with its caption, because that is what a gallery looks like
 *  before the prints arrive — and it beats an empty wall for showing that the
 *  rail is working.
 *
 *  To fill one, add `src` (and the file's real `aspect`, or it stretches):
 *
 *      { src: "/projects/foo.png", caption: "FOO", aspect: 16 / 9 }
 *
 *  Add or remove entries freely — they space themselves along the hall and
 *  alternate walls. Module-level because <Museum> memoises the wall layout on
 *  this array's identity. */
const PROJECT_GALLERY: GalleryItem[] = [
  { caption: "PROJECT 01" },
  { caption: "PROJECT 02" },
  { caption: "PROJECT 03" },
  { caption: "PROJECT 04" },
  { caption: "PROJECT 05" },
  { caption: "PROJECT 06" },
];

/** Its exhibits, so the second hall isn't the first one's stock in new colours.
 *  Abstract, and colourless by design — they take the Meraj museum's own theme
 *  pair, unlike the branded set standing along the project walls next door.
 *  Module-level so the reference is stable — the museum calls this per case. */
const merajExhibits = (i: number): Exhibit => [
  {
    geometry:
      i % 3 === 0 ? (
        <coneGeometry args={[0.42, 0.95, 18]} />
      ) : i % 3 === 1 ? (
        <dodecahedronGeometry args={[0.45, 0]} />
      ) : (
        <capsuleGeometry args={[0.28, 0.4, 6, 14]} />
      ),
  },
];

/**
 * Root scene. <Canvas> creates the WebGL renderer, scene and camera,
 * and must live in a Client Component because it touches browser APIs.
 *
 * Everything here is composition: each object owns its own geometry, and the
 * dimensions they share live in worldGeometry.
 */
export default function Scene() {
  // Lives here so both the car and the chase camera can reach it.
  const playerCar = useRef<Group>(null);

  // Worth putting in React state, unlike per-frame values: this changes twice a
  // visit, not sixty times a second. Each museum decides its own occupancy —
  // see <Museum> — and both the camera and that hall's lights hang off it.
  const [inMuseum, setInMuseum] = useState<MuseumId | null>(null);

  // Written from a museum's own report, so it can only ever name the building
  // that reported. The functional update is what makes that safe: a museum
  // clearing itself must not clear a different one that has since claimed the
  // car — the two are 120 units apart, but the ordering shouldn't be load-bearing.
  const occupancy = (id: MuseumId) => (occupied: boolean) =>
    setInMuseum((current) => (occupied ? id : current === id ? null : current));

  return (
    /* The cursor is the drag's only advertisement, and `cursor` inherits — so
       the canvas inside picks it up, and :active on this wrapper covers the
       whole press. touch-action has to be set on the canvas ITSELF (it doesn't
       inherit) or a finger drag scrolls the page instead of turning the view;
       R3F doesn't set it for us. */
    <div className="relative h-full w-full cursor-grab active:cursor-grabbing [&_canvas]:touch-none">
      <Canvas shadows camera={{ position: [4.5, 3, 9], fov: 45 }}>
        {/* Dissolves the far end of the road into the page background — and
            lifts once the car is on museum grounds, because a hall is deeper
            than the road's fog can see. Either museum counts; they are 150 units
            apart, so only one of them is ever anywhere near the camera. */}
        <SceneFog indoors={inMuseum !== null} />

        {/* Dim ambient + a weak, cool directional stand in for moonlight. Both
            are kept low on purpose: the lamps can only read as the light source
            if the scene is dark to begin with. */}
        <ambientLight intensity={0.18} />
        <directionalLight
          position={[5, 6, 5]}
          color="#93c5fd"
          intensity={0.45}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0005}
        />

        {/* The ground everything stands on, and the kerb around every edge of
            the asphalt. Comes before the roads it edges for reading order only —
            it takes no position or size, because every run of kerb is derived
            from the same worldGeometry edges the roads and isOnPavement use. */}
        <Roadside />

        {/* Lamp posts down both roads; only those near the car are lit. */}
        <StreetLamps target={playerCar} />

        {/* Main road, centered on the origin and running along z. */}
        <Road position={[0, -1.5, 0]} />

        <JunctionApron />

        {/* Left branch. Rotated a quarter turn so its length runs along x, and
            positioned so its near end overlaps the main road at the junction
            rather than leaving a gap. Edge lines are off: they'd otherwise paint
            a solid stripe across the mouth of the turn, reading as a kerb. */}
        <Road
          length={BRANCH_LENGTH}
          width={BRANCH_WIDTH}
          position={[-(ROAD_WIDTH / 2 + BRANCH_LENGTH / 2), -1.5, BRANCH_Z]}
          rotation={[0, Math.PI / 2, 0]}
          edgeLines={false}
        />

        {/* Right branch, mirroring the left. Its z comes from worldGeometry
            rather than being spelled out here, because isOnPavement has to
            agree with it exactly — a road you can see but not drive on is
            worse than no road at all. Ends at the Meraj Museum, below. */}
        <Road
          length={BRANCH_LENGTH}
          width={BRANCH_WIDTH}
          position={[ROAD_WIDTH / 2 + BRANCH_LENGTH / 2, -1.5, RIGHT_BRANCH_Z]}
          rotation={[0, Math.PI / 2, 0]}
          edgeLines={false}
        />

        <JunctionApron
          nearX={RIGHT_APRON_NEAR_X}
          farX={RIGHT_APRON_FAR_X}
          centerZ={RIGHT_BRANCH_Z}
        />

        {/* Closes off the branch, and you can drive in through the doors. It
            takes no position or size: its footprint lives in worldGeometry,
            because isOnPavement has to read the same numbers to know where the
            walls are. It also reports when the car arrives, which is what
            brings the hall lights up and moves the camera indoors. */}
        <Museum
          target={playerCar}
          name="Mahfuz Islam MUSEUM"
          portrait={MAHFUZ_PORTRAIT}
          gallery={PROJECT_GALLERY}
          exhibits={stackExhibits}
          lit={inMuseum === "left"}
          onOccupancyChange={occupancy("left")}
        />

        {/* The same building at the end of the right-hand branch, turned to face
            the road it serves. Only its placement, skin and stock differ — the
            footprint is the first museum's, which is why isOnPavement can mirror
            one set of tests instead of carrying a second set of dimensions. */}
        <Museum
          target={playerCar}
          name="MERAJ MUSEUM"
          facing={-1}
          geometry={MERAJ_MUSEUM_GEOMETRY}
          theme={MERAJ_MUSEUM_THEME}
          exhibits={merajExhibits}
          lit={inMuseum === "meraj"}
          onOccupancyChange={occupancy("meraj")}
        />

        {/* Entrance arch, a few units down-road from the start line so the car
            drives under it rather than starting on top of it. */}
        <Gate position={[0, ROAD_SURFACE_Y, ROAD_START_Z - 8]} />

        {/* Drivable: arrow keys or WASD. Starts parked, yawed 180° so it faces
            away from the camera and drives up the road rather than off-screen.
            Centered on x so there's equal room to drift either way before the
            kerb stops it. Takes its own graphite paint rather than being handed
            a colour: the body is a metallic clearcoat lit almost entirely by
            its own reflections, and a flat hue passed in from out here would
            fight that instead of tinting it. */}
        <Car
          position={[0, ROAD_SURFACE_Y, ROAD_START_Z]}
          rotation={[0, Math.PI, 0]}
          controllable
          bodyRef={playerCar}
        />

        {/* Rides behind the car, and swings around it when the canvas is
            dragged — which is the only way to see a wall you are not driving
            at. Must come after <Car> so the car's transform for this frame is
            already up to date when the camera reads it. Indoors it takes a
            tighter seat and stays inside the hall's walls; outdoors both are
            left at their defaults. */}
        <ChaseCamera
          target={playerCar}
          offset={inMuseum ? INDOOR_CHASE_OFFSET : undefined}
          bounds={inMuseum ? HALL_CAMERA_BOUNDS[inMuseum] : undefined}
        />

        {/* No <OrbitControls>: it writes camera.position and camera.quaternion
            every frame, which would fight the chase camera for control. The
            drag-to-look above is the chase camera's own, applied to its seat. */}
      </Canvas>

      {/* The controls, because neither of them announces itself — and a museum
          you can only see the far end of is what you get when nobody finds the
          second one. pointer-events-none so it can sit over the canvas without
          swallowing the drag it is advertising. */}
      <div className="pointer-events-none absolute bottom-5 left-5 select-none text-[11px] leading-5 tracking-widest text-zinc-500 uppercase">
        <p>Arrows / WASD to drive</p>
        <p>Drag to look around · drive to recentre</p>
      </div>
    </div>
  );
}
