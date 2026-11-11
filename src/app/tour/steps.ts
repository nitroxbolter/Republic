import type { CityInfo } from '../../game/events';
import { isRoadTool, isZoneTool, type ToolId } from '../../game/tools';

/** What the tour watches to know a step is done (read from the HUD atoms). */
export interface TourSnapshot {
  readonly tool: ToolId;
  readonly funds: number;
  /** Bumped when tiles or buildings change. */
  readonly worldVersion: number;
  readonly city: CityInfo | null;
}

/** Desktop and touch wording for the same step. */
export interface TourCopy {
  readonly mouse: string;
  readonly touch: string;
}

export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly body: TourCopy;
  /** `data-tour` name of the control to point at; none for a step about the map itself. */
  readonly target?: string;
  /** Once the player has opened the panel this step points at, point inside it instead. */
  readonly inside?: {
    readonly when: (now: TourSnapshot) => boolean;
    readonly target: string;
    readonly body: TourCopy;
  };
  /** Centred card over a dimmed screen (the first and last steps). */
  readonly modal?: boolean;
  /**
   * The step finishes when the player has done the thing (`start` is the snapshot when the
   * step opened). Steps without it move on with the Next button.
   */
  readonly done?: (now: TourSnapshot, start: TourSnapshot) => boolean;
}

/** Something was built with this kind of tool since the step opened: the world changed and it cost money. */
function builtWith(isTool: (t: ToolId) => boolean) {
  return (now: TourSnapshot, start: TourSnapshot) => isTool(now.tool) && now.worldVersion > start.worldVersion && now.funds < start.funds;
}

const same = (text: string): TourCopy => ({ mouse: text, touch: text });

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    modal: true,
    title: 'Welcome to Openpolis',
    body: same('This valley is yours to build. A two-minute tour shows the first steps: roads, homes and power. You can skip it and replay it any time from the ? button.'),
  },
  {
    id: 'camera',
    title: 'Look around',
    body: {
      mouse: 'Right-drag or use W A S D to move the map, scroll to zoom, and , . to rotate the view.',
      touch: 'Drag with one finger to move the map, pinch to zoom. The ☰ menu turns the view and shows the rest of the city’s numbers.',
    },
  },
  {
    id: 'pick-road',
    target: 'tool-road',
    title: 'Pick the road tool',
    body: same('Every city starts with a road. Open Roads.'),
    done: (now) => isRoadTool(now.tool),
  },
  {
    id: 'draw-road',
    title: 'Draw a road',
    body: {
      mouse: 'Drag across open land to lay a street. Hold Shift for a straight line. The price shows before you let go.',
      touch: 'Drag across open land to sketch a street, then tap Build. Use two fingers to move the map meanwhile.',
    },
    done: builtWith(isRoadTool),
  },
  {
    id: 'pick-homes',
    target: 'tool-zone-r',
    title: 'Zone some homes',
    body: same('People move in where you zone for them. Pick Homes.'),
    done: (now) => isZoneTool(now.tool),
  },
  {
    id: 'paint-homes',
    title: 'Paint the zone',
    body: {
      mouse: 'Drag beside your road. Houses grow on zoned land close to a road.',
      touch: 'Drag beside your road, then tap Build. Houses grow on zoned land close to a road.',
    },
    done: builtWith(isZoneTool),
  },
  {
    id: 'utilities',
    target: 'tool-build',
    title: 'Power and water',
    body: same('Homes stay empty without power and water. Open Civic, go to Utilities, and place a power plant and a water pump next to your road.'),
    inside: {
      when: (now) => now.tool === 'build',
      target: 'civic-utilities',
      body: same('Pick Utilities, then place a power plant and a water pump beside your road.'),
    },
    done: (now) => (now.city?.power.supply ?? 0) > 0 && (now.city?.water.supply ?? 0) > 0,
  },
  {
    id: 'demand',
    target: 'demand',
    title: 'Read what the city wants',
    body: {
      mouse: 'These bars show demand for homes, shops and industry. Zone whatever is tallest; hover them for the reason.',
      touch: 'These bars show demand for homes, shops and industry. Zone whatever is tallest.',
    },
  },
  {
    id: 'speed',
    target: 'speed',
    title: 'Set the pace',
    body: {
      mouse: 'Pause, or speed time up while the city grows. Space pauses, [ and ] change speed.',
      touch: 'Pause, or speed time up while the city grows.',
    },
  },
  {
    id: 'done',
    modal: true,
    title: "You're the planner now",
    body: same('Add shops and industry for jobs and parks to keep people happy. As the city grows it unlocks schools, hospitals, universities and more: click the stage badge next to the population to see what comes next. Your city saves itself as you go.'),
  },
];
