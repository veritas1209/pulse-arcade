// BLUECAP 3D map. rotation uses radians; requires shared/rotated-collision.js integration.
export const TRAINING_WORLD = {
  "id": "warehouse-training",
  "name": "창고 훈련장",
  "size": 106.6,
  "spawn": {
    "x": 0,
    "z": 49.4
  },
  "roads": [],
  "buildings": [],
  "terrain": [
    {
      "id": "training-yard",
      "kind": "yard",
      "x": 0,
      "z": 0,
      "w": 106.6,
      "d": 106.6
    }
  ],
  "landmarks": [],
  "radiationZones": [
    {
      "id": "training-render-anchor",
      "x": 1300,
      "z": 1300,
      "radius": 0
    }
  ],
  "lootSpawns": [],
  "enemySpawns": [
    {
      "id": "training-front",
      "kind": "raider",
      "x": 2.6,
      "z": -14.3,
      "radius": 30
    },
    {
      "id": "training-left",
      "kind": "raider",
      "x": -39,
      "z": -1.3,
      "radius": 30
    },
    {
      "id": "training-right",
      "kind": "raider",
      "x": 6.5,
      "z": -29.9,
      "radius": 30
    },
    {
      "id": "training-rear",
      "kind": "raider",
      "x": -2.6,
      "z": -28.6,
      "radius": 30
    },
    {
      "id": "training-heavy",
      "kind": "heavy",
      "x": 5.2,
      "z": 1.3,
      "radius": 30
    },
    {
      "id": "training-far",
      "kind": "heavy",
      "x": 35.1,
      "z": -2.6,
      "radius": 30
    },
    {
      "id": "training-dps",
      "kind": "heavy",
      "x": -19.5,
      "z": 40.3,
      "radius": 0,
      "trainingImmortal": true,
      "name": "DPS 표적"
    },
    {
      "id": "training-heavy-1",
      "name": "중장갑 표적",
      "x": -27.3,
      "z": -6.5,
      "kind": "heavy",
      "radius": 30
    },
    {
      "id": "training-enemy-1",
      "name": "일반 표적",
      "x": 8,
      "z": -7,
      "kind": "raider",
      "radius": 30
    },
    {
      "id": "training-enemy-2",
      "name": "일반 표적",
      "x": 1,
      "z": 10,
      "kind": "raider",
      "radius": 30
    },
    {
      "id": "training-heavy-2",
      "name": "중장갑 표적",
      "x": -9,
      "z": -9,
      "kind": "heavy",
      "radius": 30
    }
  ],
  "accessDoors": [],
  "extractions": [],
  "obstacles": [
    {
      "id": "warehouse-nw",
      "x": -11.7,
      "z": -22.1,
      "w": 10.4,
      "d": 1.3,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-ne",
      "x": 13,
      "z": -20.8,
      "w": 10.4,
      "d": 1.3,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": -0.253072741539178
    },
    {
      "id": "warehouse-sw",
      "x": -11.7,
      "z": 19.5,
      "w": 10.4,
      "d": 1.3,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-se",
      "x": 13,
      "z": 19.5,
      "w": 10.4,
      "d": 1.3,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-wn",
      "x": -16.9,
      "z": -16.9,
      "w": 1.3,
      "d": 10.4,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-ws",
      "x": -16.9,
      "z": 14.3,
      "w": 1.3,
      "d": 10.4,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-en",
      "x": 18.2,
      "z": -14.3,
      "w": 1.3,
      "d": 10.4,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-es",
      "x": 18.2,
      "z": 14.3,
      "w": 1.3,
      "d": 10.4,
      "h": 2.8,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0.001745329251994221
    },
    {
      "id": "warehouse-inner-b",
      "x": 6.5,
      "z": 5.2,
      "w": 6.5,
      "d": 1.3,
      "h": 2.3,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "warehouse-inner-c",
      "x": 2.6,
      "z": -10.4,
      "w": 1.3,
      "d": 3.9,
      "h": 2.3,
      "kind": "barrier",
      "color": "#82918b",
      "rotation": -1.6126842288427605
    },
    {
      "id": "west-container-n",
      "x": -31.2,
      "z": -33.8,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "kind": "container",
      "color": "#718b84",
      "rotation": 0.5846852994181013
    },
    {
      "id": "east-container-n",
      "x": 35.1,
      "z": -35.1,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "kind": "container",
      "color": "#8c816e",
      "rotation": -0.3752457891787806
    },
    {
      "id": "east-container-s",
      "x": 29.9,
      "z": 29.9,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "kind": "container",
      "color": "#718b84",
      "rotation": -0.9075712110370517
    },
    {
      "id": "west-flank",
      "x": -27.3,
      "z": 0,
      "w": 2.6,
      "d": 9.1,
      "h": 2.2,
      "kind": "container",
      "color": "#a16f59",
      "rotation": 0
    },
    {
      "id": "east-flank",
      "x": 33.8,
      "z": 3.9,
      "w": 2.6,
      "d": 9.1,
      "h": 2.2,
      "kind": "container",
      "color": "#a16f59",
      "rotation": -0.22165681500328027
    },
    {
      "id": "west-sandbag",
      "x": -28.6,
      "z": 11.7,
      "w": 5.85,
      "d": 1.56,
      "h": 1.1,
      "kind": "sandbag",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "east-sandbag",
      "x": 23.4,
      "z": -13,
      "w": 5.85,
      "d": 1.56,
      "h": 1.1,
      "kind": "sandbag",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "south-cover-a",
      "x": -15.6,
      "z": 28.6,
      "w": 5.2,
      "d": 1.56,
      "h": 1.1,
      "kind": "sandbag",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "south-cover-b",
      "x": 15.6,
      "z": 28.6,
      "w": 5.2,
      "d": 1.56,
      "h": 1.1,
      "kind": "sandbag",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "north-cover-a",
      "x": -9.1,
      "z": -44.2,
      "w": 5.2,
      "d": 1.56,
      "h": 1.1,
      "kind": "sandbag",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "north-cover-b",
      "x": 16.9,
      "z": -41.6,
      "w": 5.2,
      "d": 1.56,
      "h": 1.1,
      "kind": "sandbag",
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "container-1",
      "kind": "container",
      "x": -9,
      "z": -2,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": -1.893682238413847
    },
    {
      "id": "container-2",
      "kind": "container",
      "x": 26,
      "z": 36.4,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0.6702064327658235
    },
    {
      "id": "container-3",
      "kind": "container",
      "x": -24.7,
      "z": 33.8,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0
    },
    {
      "id": "barrier-1",
      "kind": "barrier",
      "x": 0,
      "z": 27.3,
      "w": 6.5,
      "d": 1.3,
      "h": 2.8,
      "color": "#82918b",
      "rotation": -0.14660765716752344
    },
    {
      "id": "sandbag-1",
      "kind": "sandbag",
      "x": -36.4,
      "z": 23.4,
      "w": 5.85,
      "d": 1.56,
      "h": 1.1,
      "color": "#b4aa86",
      "rotation": 0.891863247769102
    },
    {
      "id": "sandbag-3",
      "kind": "sandbag",
      "x": 1.3,
      "z": 13,
      "w": 5.85,
      "d": 1.56,
      "h": 1.1,
      "color": "#b4aa86",
      "rotation": 0
    },
    {
      "id": "container-4",
      "kind": "container",
      "x": 44.2,
      "z": -11.7,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": -0.4572762640225143
    },
    {
      "id": "container-5",
      "kind": "container",
      "x": -40.3,
      "z": -10.4,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": -0.18849555921538652
    },
    {
      "id": "container-6",
      "kind": "container",
      "x": -44.2,
      "z": 9.1,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": -0.2164208272472976
    },
    {
      "id": "container-7",
      "kind": "container",
      "x": 41.6,
      "z": 41.6,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0.6579891280018622
    },
    {
      "id": "container-8",
      "kind": "container",
      "x": -40.3,
      "z": 41.6,
      "w": 10.4,
      "d": 3.9,
      "h": 2.5,
      "color": "#718b84",
      "rotation": -0.5899212871740822
    },
    {
      "id": "barrier-2",
      "kind": "barrier",
      "x": 41.6,
      "z": 13,
      "w": 6.5,
      "d": 1.3,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0.42411500823462234
    },
    {
      "id": "barrier-3",
      "kind": "barrier",
      "x": -4,
      "z": -22,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "barrier-4",
      "kind": "barrier",
      "x": -4,
      "z": 20,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": -0.13788101090755234
    },
    {
      "id": "barrier-5",
      "kind": "barrier",
      "x": 6,
      "z": -22,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0.013962634015953768
    },
    {
      "id": "container-9",
      "kind": "container",
      "x": 20,
      "z": 0,
      "w": 8,
      "d": 3,
      "h": 2.5,
      "color": "#718b84",
      "rotation": -0.8307767239493007
    },
    {
      "id": "container-10",
      "kind": "container",
      "x": 7,
      "z": -4,
      "w": 8,
      "d": 3,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0
    },
    {
      "id": "container-11",
      "kind": "container",
      "x": -29,
      "z": -20,
      "w": 8,
      "d": 3,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0.57246799465414
    },
    {
      "id": "container-12",
      "kind": "container",
      "x": -11,
      "z": -35,
      "w": 8,
      "d": 3,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0
    },
    {
      "id": "barrier-6",
      "kind": "barrier",
      "x": 3,
      "z": -36,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "barrier-7",
      "kind": "barrier",
      "x": 8,
      "z": -36,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "barrier-8",
      "kind": "barrier",
      "x": 2,
      "z": -41,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "barrier-9",
      "kind": "barrier",
      "x": 7,
      "z": -41,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": 0
    },
    {
      "id": "barrier-10",
      "kind": "barrier",
      "x": 0,
      "z": -38,
      "w": 5,
      "d": 1,
      "h": 2.8,
      "color": "#82918b",
      "rotation": -1.466076571675237
    },
    {
      "id": "container-13",
      "kind": "container",
      "x": -4,
      "z": 36,
      "w": 8,
      "d": 3,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0
    },
    {
      "id": "container-14",
      "kind": "container",
      "x": 12,
      "z": 36,
      "w": 8,
      "d": 3,
      "h": 2.5,
      "color": "#718b84",
      "rotation": 0
    }
  ]
};
