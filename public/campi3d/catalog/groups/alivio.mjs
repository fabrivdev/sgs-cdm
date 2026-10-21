// Recetas 3D Campi v5. Autoría por acción; no implica validación visual.
// Los tiempos están normalizados. La anatomía ausente se declara, nunca se simula.
export const recipes = [
  {
    "id": "alivio-01",
    "state": "alivio",
    "label": "relajar los hombros",
    "duration": 3.8,
    "level": "interaccion",
    "family": "shoulder_relax",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "shoulder.L.lift": [
        [0, 0],
        [0.14, 0.075],
        [0.27, 0.075],
        [0.57, -0.06],
        [0.76, -0.06],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.17, 0.07],
        [0.29, 0.07],
        [0.61, -0.055],
        [0.78, -0.055],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.21, 0.022],
        [0.35, 0.022],
        [0.65, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.29, 0.03],
        [0.57, 0.055],
        [0.83, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.39, -0.12],
        [0.66, -0.12],
        [0.87, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.47, 0.09],
        [0.76, 0.09],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.46, 0.6],
        [0.8, 0.6],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.5, 0.6],
        [0.82, 0.6],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.28,
        "type": "brief_rigid_shoulders_reference"
      },
      {
        "at": 0.61,
        "type": "shoulders_relaxed"
      },
      {
        "at": 0.78,
        "type": "relief_hold_ends"
      }
    ],
    "acceptance": [
      "Hombros se relajan, diferenciándose de postura rígida previa."
    ],
    "status": "authored_unvalidated",
    "notes": "Incluye una referencia previa breve de hombros elevados, seguida de descenso claro y relajación facial tardía. Sin ciclo repetido de hombros ni elevación alegre."
  },
  {
    "id": "alivio-02",
    "state": "alivio",
    "label": "cerrar los ojos y sonreír suavemente",
    "duration": 3.8,
    "level": "interaccion",
    "family": "smile_eyes_closed",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.blinkL": [
        [0, 0],
        [0.19, 0],
        [0.29, 1],
        [0.6, 1],
        [0.77, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.205, 0],
        [0.31, 1],
        [0.62, 1],
        [0.79, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.23, 0.045],
        [0.44, 0.13],
        [0.77, 0.13],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.38, -0.045],
        [0.68, -0.045],
        [0.91, 0],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.41, -0.04],
        [0.7, -0.04],
        [0.93, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.35, 0.03],
        [0.61, 0.045],
        [0.85, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.32,
        "type": "relief_eyes_closed"
      },
      {
        "at": 0.45,
        "type": "soft_smile_during_release"
      },
      {
        "at": 0.8,
        "type": "quiet_eyes_reopen"
      }
    ],
    "acceptance": [
      "Ojos cerrados con sonrisa suave, no amplia celebración."
    ],
    "status": "authored_unvalidated",
    "notes": "El cierre de ojos llega antes de la sonrisa suave; hombros bajan y cabeza cede después. Se diferencia de contento-03 por liberación corporal y orden de fases, no sólo amplitud."
  },
  {
    "id": "alivio-03",
    "state": "alivio",
    "label": "apoyar ambas manos sobre la cintura",
    "duration": 3.8,
    "level": "interaccion",
    "family": "hands_waist",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.hip": [
        [0, 0],
        [0.15, 0.1],
        [0.39, 1],
        [0.76, 1],
        [1, 0]
      ],
      "arm.R.hip": [
        [0, 0],
        [0.21, 0.1],
        [0.46, 1],
        [0.76, 1],
        [1, 0]
      ],
      "hand.L.relaxed": [
        [0, 0],
        [0.28, 0.85],
        [0.78, 0.85],
        [1, 0]
      ],
      "hand.R.relaxed": [
        [0, 0],
        [0.35, 0.85],
        [0.78, 0.85],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.46, -0.03],
        [0.76, -0.03],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.51, -0.03],
        [0.78, -0.03],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.3, 0.1],
        [0.79, 0.1],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.56, 0.025],
        [0.75, 0.025],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.46,
        "type": "both_hands_on_waist"
      },
      {
        "at": 0.77,
        "type": "hands_waist_hold_ends"
      }
    ],
    "acceptance": [
      "Ambas manos se apoyan en la cintura."
    ],
    "status": "authored_unvalidated",
    "notes": "Ambas manos alcanzan realmente cintura con llegada ligeramente escalonada, luego se relajan hombros. No sustituir segunda mano por brazo colgante."
  },
  {
    "id": "alivio-04",
    "state": "alivio",
    "label": "asentir lentamente",
    "duration": 4.6,
    "level": "interaccion",
    "family": "nod",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.eyeOpen": [
        [0, 0],
        [0.15, -0.09],
        [0.69, -0.09],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.2, -0.012],
        [0.49, 0.115],
        [0.61, 0.115],
        [0.91, 0],
        [1, 0]
      ],
      "gaze.y": [
        [0, 0],
        [0.32, -0.045],
        [0.65, -0.045],
        [0.88, 0],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.24, -0.025],
        [0.72, -0.025],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.27, -0.025],
        [0.74, -0.025],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.36, 0.095],
        [0.81, 0.095],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.49,
        "type": "slow_nod_bottom"
      },
      {
        "at": 0.61,
        "type": "slow_nod_return_begins"
      },
      {
        "at": 0.92,
        "type": "slow_nod_finished"
      }
    ],
    "acceptance": [
      "Asentimiento lento y tranquilo."
    ],
    "status": "authored_unvalidated",
    "notes": "Un asentimiento lento con pausa abajo y rostro que se suaviza durante el descenso; hombros ya han cedido antes. Sin doble rebote ni pulso genérico de todas las piezas."
  },
  {
    "id": "alivio-05",
    "state": "alivio",
    "label": "llevar una mano al pecho",
    "duration": 3.8,
    "level": "interaccion",
    "family": "hand_chest",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.chest": [
        [0, 0],
        [0.17, 0.1],
        [0.4, 1],
        [0.75, 1],
        [1, 0]
      ],
      "hand.L.open": [
        [0, 0],
        [0.29, 0.8],
        [0.76, 0.8],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.36, 0],
        [0.42, 0.85],
        [0.58, 0.85],
        [0.7, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.375, 0],
        [0.44, 0.85],
        [0.59, 0.85],
        [0.72, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.4, 0.05],
        [0.61, 0.12],
        [0.81, 0.12],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.29, 0.02],
        [0.53, 0.065],
        [0.68, 0.065],
        [0.91, 0],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.47, -0.045],
        [0.76, -0.045],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.34, 0.012],
        [0.56, 0.03],
        [0.75, 0.03],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.41,
        "type": "left_hand_reaches_chest"
      },
      {
        "at": 0.58,
        "type": "relief_exhale_expression"
      }
    ],
    "acceptance": [
      "Una mano al pecho con expresión de alivio."
    ],
    "status": "authored_unvalidated",
    "notes": "Mano izquierda al pecho, cabeza baja y ojos suaves después del contacto; hombro libre se relaja. Es liberación, no pecho erguido/orgulloso de contento-09."
  },
  {
    "id": "alivio-06",
    "state": "alivio",
    "label": "levantar un pulgar con expresión tranquila",
    "duration": 3.8,
    "level": "interaccion",
    "family": "thumb_up",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.eyeOpen": [
        [0, 0],
        [0.15, -0.075],
        [0.7, -0.075],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.23, -0.035],
        [0.73, -0.035],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.26, -0.03],
        [0.74, -0.03],
        [1, 0]
      ],
      "arm.L.fistUp": [
        [0, 0],
        [0.3, 0.15],
        [0.49, 0.65],
        [0.74, 0.65],
        [1, 0]
      ],
      "hand.L.thumbUp": [
        [0, 0],
        [0.36, 0.3],
        [0.52, 1],
        [0.76, 1],
        [0.93, 0.15],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.29, 0.075],
        [0.57, 0.12],
        [0.79, 0.12],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.4, 0.025],
        [0.61, 0.06],
        [0.84, 0],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.39, 0.55],
        [0.8, 0.55],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.27,
        "type": "quiet_posture_release"
      },
      {
        "at": 0.52,
        "type": "discreet_left_thumb_up"
      },
      {
        "at": 0.62,
        "type": "quiet_acknowledgement"
      }
    ],
    "acceptance": [
      "Pulgar arriba discreto junto a rostro tranquilo."
    ],
    "status": "authored_unvalidated",
    "notes": "Primero se relajan ojos/hombros, después pulgar izquierdo a altura contenida y pequeño reconocimiento con cabeza. Mano opuesta y fases distintas del gesto contento de logro."
  },
  {
    "id": "alivio-07",
    "state": "alivio",
    "label": "estirar ligeramente los brazos",
    "duration": 3.8,
    "level": "interaccion",
    "family": "arms_stretch",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.stretch": [
        [0, 0],
        [0.18, 0.15],
        [0.43, 0.72],
        [0.61, 0.72],
        [0.85, 0.18],
        [1, 0]
      ],
      "arm.R.stretch": [
        [0, 0],
        [0.23, 0.15],
        [0.49, 0.72],
        [0.63, 0.72],
        [0.88, 0.18],
        [1, 0]
      ],
      "hand.L.open": [
        [0, 0],
        [0.31, 0.65],
        [0.65, 0.65],
        [0.87, 0],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.37, 0.65],
        [0.68, 0.65],
        [0.9, 0],
        [1, 0]
      ],
      "hand.L.roll": [
        [0, 0],
        [0.44, -0.1],
        [0.65, -0.1],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.5, 0.1],
        [0.67, 0.1],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.32, -0.018],
        [0.55, -0.033],
        [0.68, -0.033],
        [0.92, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.4, -0.12],
        [0.65, -0.12],
        [0.86, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.46, 0.07],
        [0.75, 0.07],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.49,
        "type": "both_arms_gentle_stretch"
      },
      {
        "at": 0.64,
        "type": "stretch_releases"
      }
    ],
    "acceptance": [
      "Brazos se estiran ligeramente, sin saltos ni celebración."
    ],
    "status": "authored_unvalidated",
    "notes": "Estiramiento bilateral moderado con extensión sostenida y liberación lenta, manos que se abren durante la extensión. Sin subir brazos en celebración ni despegar pies."
  },
  {
    "id": "alivio-08",
    "state": "alivio",
    "label": "realizar una pequeña inclinación de agradecimiento",
    "duration": 3.8,
    "level": "interaccion",
    "family": "grateful_bow",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.chest": [
        [0, 0],
        [0.18, 0.1],
        [0.33, 0.8],
        [0.73, 0.8],
        [1, 0]
      ],
      "hand.L.open": [
        [0, 0],
        [0.25, 0.75],
        [0.76, 0.75],
        [1, 0]
      ],
      "arm.R.palmUp": [
        [0, 0],
        [0.24, 0.12],
        [0.42, 0.42],
        [0.7, 0.42],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.32, 0.7],
        [0.72, 0.7],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.16, 0.1],
        [0.77, 0.1],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.27, 0],
        [0.49, 0.12],
        [0.61, 0.12],
        [0.87, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.34, 0.02],
        [0.53, 0.055],
        [0.65, 0.055],
        [0.91, 0],
        [1, 0]
      ],
      "body.shiftY": [
        [0, 0],
        [0.39, 0.01],
        [0.57, 0.015],
        [0.65, 0.015],
        [0.87, 0],
        [1, 0]
      ],
      "gaze.y": [
        [0, 0],
        [0.42, -0.07],
        [0.64, -0.07],
        [0.84, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.34,
        "type": "thankful_hand_on_chest"
      },
      {
        "at": 0.54,
        "type": "small_grateful_bow"
      },
      {
        "at": 0.92,
        "type": "grateful_bow_return"
      }
    ],
    "acceptance": [
      "Pequeña inclinación de agradecimiento y retorno."
    ],
    "status": "authored_unvalidated",
    "notes": "Agradecimiento con mano izquierda al pecho y derecha ofrecida, seguido de una pequeña inclinación. Distinto de la reverencia contenta con brazo atrás; retorno suave sin desanclar."
  },
  {
    "id": "alivio-09",
    "state": "alivio",
    "label": "mirar el indicador resuelto y después al usuario con satisfacción",
    "duration": 3.8,
    "level": "interaccion",
    "family": "gaze_target_alternate",
    "compatibleStates": [
      "alivio"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.target": [
        [0, 0],
        [0.17, 1],
        [0.42, 1],
        [0.57, 0],
        [1, 0]
      ],
      "gaze.secondary": [
        [0, 0],
        [0.49, 0],
        [0.66, 1],
        [0.85, 1],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.31, 0.035],
        [0.52, 0.12],
        [0.83, 0.12],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.4, -0.045],
        [0.79, -0.045],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.22, 0.015],
        [0.4, 0.015],
        [0.69, 0.055],
        [0.81, 0.018],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.48, -0.035],
        [0.8, -0.035],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.51, -0.035],
        [0.81, -0.035],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.18,
        "type": "resolved_indicator_inspected"
      },
      {
        "at": 0.53,
        "type": "satisfied_expression_emerges"
      },
      {
        "at": 0.67,
        "type": "return_to_user_satisfied"
      }
    ],
    "acceptance": [
      "Mirada primero al indicador resuelto, después al usuario, con satisfacción.",
      "El estado resuelto y el destino visible deben proporcionarse desde la aplicación; la animación no valida resultados de negocio."
    ],
    "status": "authored_unvalidated",
    "notes": "Primero atención al indicador que la aplicación declara resuelto; después sonrisa y retorno al usuario. No deduce por sí mismo que un dato esté resuelto. target obligatorio indicador; secondaryTarget opcional usuario/frente.",
    "requiresTarget": true,
    "targetRole": "resolvedIndicator",
    "secondaryTargetRole": "conversation"
  }
];
