// Recetas 3D Campi v5. Autoría por acción; no implica validación visual.
// Los tiempos están normalizados. La anatomía ausente se declara, nunca se simula.
export const recipes = [
  {
    "id": "atento-01",
    "state": "atento",
    "label": "abrir ligeramente los ojos y levantar un dedo",
    "duration": 3.8,
    "level": "interaccion",
    "family": "index_raise",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.eyeOpen": [
        [0, 0],
        [0.14, 0.11],
        [0.6, 0.11],
        [0.85, 0],
        [1, 0]
      ],
      "face.browRaise": [
        [0, 0],
        [0.2, 0.011],
        [0.61, 0.011],
        [0.87, 0],
        [1, 0]
      ],
      "arm.R.indexUp": [
        [0, 0],
        [0.21, 0.1],
        [0.4, 0.87],
        [0.73, 0.87],
        [1, 0]
      ],
      "hand.R.point": [
        [0, 0],
        [0.29, 0.2],
        [0.44, 1],
        [0.74, 1],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.18, 0.025],
        [0.53, 0.025],
        [0.84, 0],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.32, 0.4],
        [0.8, 0.4],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.15,
        "type": "eyes_open_slightly"
      },
      {
        "at": 0.44,
        "type": "moderate_index_raise"
      }
    ],
    "acceptance": [
      "Ojos ligeramente abiertos y un dedo levantado; intensidad moderada, no alarma.",
      "Índice anatómico extendido; medio/anular/meñique plegados."
    ],
    "status": "authored_unvalidated",
    "notes": "Los ojos anuncian atención moderada y luego sube un solo índice. Boca sin sorpresa, sin cejas alarmadas ni brazo de celebración."
  },
  {
    "id": "atento-02",
    "state": "atento",
    "label": "inclinar la cabeza hacia adelante",
    "duration": 3.8,
    "level": "interaccion",
    "family": "head_forward",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.target": [
        [0, 0],
        [0.14, 0.75],
        [0.7, 0.75],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.23, 0.025],
        [0.43, 0.15],
        [0.65, 0.15],
        [0.9, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.34, 0],
        [0.55, 0.022],
        [0.72, 0.022],
        [0.95, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.19, 0.055],
        [0.72, 0.055],
        [1, 0]
      ],
      "face.browRaise": [
        [0, 0],
        [0.31, 0.006],
        [0.65, 0.006],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.44,
        "type": "head_forward_listening_hold"
      },
      {
        "at": 0.91,
        "type": "head_returns"
      }
    ],
    "acceptance": [
      "Cabeza inclinada hacia adelante de forma legible y breve."
    ],
    "status": "authored_unvalidated",
    "notes": "Cabeza se inclina hacia adelante y sostiene la escucha, sin ciclo abajo-arriba repetido. Atención ocular aparece antes; torso acompaña muy poco y con retraso.",
    "targetRole": "conversation"
  },
  {
    "id": "atento-03",
    "state": "atento",
    "label": "mirar fijamente una cifra del Panorama",
    "duration": 3.8,
    "level": "interaccion",
    "family": "gaze_target_hold",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.target": [
        [0, 0],
        [0.16, 1],
        [0.82, 1],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.3, 0.025],
        [0.76, 0.025],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.21, 0.07],
        [0.8, 0.07],
        [1, 0]
      ],
      "face.browL": [
        [0, 0],
        [0.28, 0.018],
        [0.78, 0.018],
        [1, 0]
      ],
      "face.browR": [
        [0, 0],
        [0.3, -0.018],
        [0.78, -0.018],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.32, 0.45],
        [0.83, 0.45],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.35, 0.45],
        [0.83, 0.45],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.17,
        "type": "panorama_figure_target_acquired"
      },
      {
        "at": 0.81,
        "type": "sustained_figure_attention_ends"
      }
    ],
    "acceptance": [
      "Mirada fija dirigida a una cifra concreta del Panorama; debe existir un destino visible.",
      "Registrar y verificar el destino real del indicador en la prueba de integración."
    ],
    "status": "authored_unvalidated",
    "notes": "Requiere target de la cifra visible del Panorama; no se inventa el dato ni se sustituye por ojos centrados. Mirada sostenida sin alternancia ni parpadeo autorado durante la fijación.",
    "requiresTarget": true,
    "targetRole": "panoramaFigure"
  },
  {
    "id": "atento-04",
    "state": "atento",
    "label": "levantar una mano como indicando algo importante",
    "duration": 3.8,
    "level": "interaccion",
    "family": "hand_raise",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.eyeOpen": [
        [0, 0],
        [0.16, 0.07],
        [0.66, 0.07],
        [1, 0]
      ],
      "arm.R.palmOut": [
        [0, 0],
        [0.2, 0.12],
        [0.41, 0.95],
        [0.7, 0.95],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.29, 0.8],
        [0.73, 0.8],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.38, -0.045],
        [0.72, -0.045],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.31, 0.04],
        [0.64, 0.04],
        [0.89, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.37, -0.018],
        [0.72, -0.018],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.31, 0.5],
        [0.78, 0.5],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.42,
        "type": "single_important_open_hand"
      },
      {
        "at": 0.7,
        "type": "importance_hold_ends"
      }
    ],
    "acceptance": [
      "Una mano se levanta para destacar importancia, sin celebración."
    ],
    "status": "authored_unvalidated",
    "notes": "Una mano levantada a altura moderada con palma abierta hacia delante, como solicitando atención. No raise bilateral, sonrisa festiva ni puño."
  },
  {
    "id": "atento-05",
    "state": "atento",
    "label": "girar la cabeza hacia el tema destacado",
    "duration": 3.8,
    "level": "interaccion",
    "family": "head_target_turn",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.target": [
        [0, 0],
        [0.2, 1],
        [0.67, 1],
        [0.9, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.13, 0.05],
        [0.68, 0.05],
        [1, 0]
      ],
      "torso.yaw": [
        [0, 0],
        [0.3, 0],
        [0.43, 0.025],
        [0.64, 0.025],
        [0.9, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.73, 0],
        [0.755, 0.85],
        [0.79, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.735, 0],
        [0.76, 0.85],
        [0.795, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.2,
        "type": "highlight_target_acquired"
      },
      {
        "at": 0.67,
        "type": "highlight_head_hold_ends"
      },
      {
        "at": 0.9,
        "type": "head_returns_to_context"
      }
    ],
    "acceptance": [
      "Cabeza gira hacia el tema/bloque destacado y retorna.",
      "Probar targets a ambos lados; la cabeza debe cambiar el signo del giro y no sólo los ojos."
    ],
    "status": "authored_unvalidated",
    "notes": "El giro de cabeza debe provenir del resolvedor de target hacia el tema real, no de yaw fijo. gaze.target debe aportar cabeza y ojos con desfase; verificar orientación real de nodos y retorno.",
    "requiresTarget": true,
    "targetRole": "highlightedTopic"
  },
  {
    "id": "atento-06",
    "state": "atento",
    "label": "apoyar una mano en la cintura mientras señala con la otra",
    "duration": 3.8,
    "level": "interaccion",
    "family": "waist_point",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.hip": [
        [0, 0],
        [0.17, 0.2],
        [0.34, 1],
        [0.79, 1],
        [1, 0]
      ],
      "hand.L.relaxed": [
        [0, 0],
        [0.26, 0.8],
        [0.8, 0.8],
        [1, 0]
      ],
      "gaze.target": [
        [0, 0],
        [0.2, 0.85],
        [0.75, 0.85],
        [1, 0]
      ],
      "arm.R.point": [
        [0, 0],
        [0.24, 0.08],
        [0.48, 1],
        [0.75, 1],
        [1, 0]
      ],
      "hand.R.point": [
        [0, 0],
        [0.34, 0.3],
        [0.5, 1],
        [0.75, 1],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.36, -0.02],
        [0.74, -0.02],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.21, 0.065],
        [0.74, 0.065],
        [1, 0]
      ],
      "body.shiftX": [
        [0, 0],
        [0.4, -0.014],
        [0.76, -0.014],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.35,
        "type": "left_hand_waist_ready"
      },
      {
        "at": 0.5,
        "type": "right_index_points_while_left_on_waist"
      }
    ],
    "acceptance": [
      "Una mano está en cintura mientras la otra señala; ambas acciones son simultáneas.",
      "Verificar mano en cintura y rayo de señalamiento simultáneos durante .50–.75."
    ],
    "status": "authored_unvalidated",
    "notes": "La mano izquierda llega primero a cintura y la derecha señala después el target real; ambas acciones se sostienen simultáneamente. No se alternan como dos gestos separados.",
    "requiresTarget": true,
    "targetRole": "indicator"
  },
  {
    "id": "atento-07",
    "state": "atento",
    "label": "adoptar una postura más erguida",
    "duration": 3.8,
    "level": "interaccion",
    "family": "upright",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "torso.pitch": [
        [0, 0],
        [0.2, -0.025],
        [0.42, -0.075],
        [0.76, -0.075],
        [1, 0]
      ],
      "body.height": [
        [0, 0],
        [0.28, 0.008],
        [0.46, 0.018],
        [0.76, 0.018],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.32, -0.025],
        [0.74, -0.025],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.35, -0.025],
        [0.76, -0.025],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.35, 0.018],
        [0.54, 0.032],
        [0.77, 0.032],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.26, 0.8],
        [0.78, 0.8],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.31, 0.8],
        [0.8, 0.8],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.18, 0.065],
        [0.76, 0.065],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.47,
        "type": "upright_posture_established"
      },
      {
        "at": 0.76,
        "type": "upright_hold_ends"
      }
    ],
    "acceptance": [
      "Cuerpo adopta postura más erguida, distinta de la pose de reposo.",
      "Validar margen de extensión de rodillas sin romper contacto de pies."
    ],
    "status": "authored_unvalidated",
    "notes": "Se organiza primero el torso, luego se extiende ligeramente la altura sobre piernas apoyadas y se alinean cabeza/hombros. No salto ni mera rotación de cabeza."
  },
  {
    "id": "atento-08",
    "state": "atento",
    "label": "hacer un pequeño asentimiento de concentración",
    "duration": 3.8,
    "level": "interaccion",
    "family": "nod",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.target": [
        [0, 0],
        [0.13, 0.9],
        [0.76, 0.9],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.18, -0.045],
        [0.68, -0.045],
        [1, 0]
      ],
      "face.browL": [
        [0, 0],
        [0.22, 0.02],
        [0.67, 0.02],
        [1, 0]
      ],
      "face.browR": [
        [0, 0],
        [0.25, -0.02],
        [0.67, -0.02],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.26, -0.015],
        [0.46, 0.095],
        [0.65, 0.02],
        [0.83, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.35, 0.012],
        [0.65, 0.012],
        [0.87, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.14,
        "type": "concentrated_gaze_acquired"
      },
      {
        "at": 0.46,
        "type": "single_concentration_nod"
      },
      {
        "at": 0.84,
        "type": "nod_returns"
      }
    ],
    "acceptance": [
      "Asentimiento pequeño con mirada concentrada."
    ],
    "status": "authored_unvalidated",
    "notes": "La fijación y el leve enfoque ocular preceden al único asentimiento. A diferencia de sereno, se mantiene atención dirigida durante la recuperación.",
    "targetRole": "conversation"
  },
  {
    "id": "atento-09",
    "state": "atento",
    "label": "levantar ambas cejas digitales",
    "duration": 3.8,
    "level": "interaccion",
    "family": "brows_raise",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.browRaise": [
        [0, 0],
        [0.18, 0.012],
        [0.35, 0.035],
        [0.61, 0.035],
        [0.84, 0],
        [1, 0]
      ],
      "face.browL": [
        [0, 0],
        [0.25, -0.025],
        [0.62, -0.025],
        [0.85, 0],
        [1, 0]
      ],
      "face.browR": [
        [0, 0],
        [0.27, 0.025],
        [0.62, 0.025],
        [0.85, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.31, 0.055],
        [0.65, 0.055],
        [0.87, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.39, -0.018],
        [0.62, -0.018],
        [0.88, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.35,
        "type": "both_digital_brows_raised"
      },
      {
        "at": 0.84,
        "type": "brows_return"
      }
    ],
    "acceptance": [
      "Ambas cejas digitales se elevan; no sólo aumento del tamaño ocular.",
      "Medir traslación de ambos nodos de ceja respecto al rostro."
    ],
    "status": "authored_unvalidated",
    "notes": "Elevación real bilateral de cejas, con apertura ocular secundaria y tardía. El aumento de tamaño ocular por sí solo no cumple el criterio."
  },
  {
    "id": "atento-10",
    "state": "atento",
    "label": "dirigir la mirada alternativamente entre el usuario y el indicador",
    "duration": 3.8,
    "level": "interaccion",
    "family": "gaze_target_alternate",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.target": [
        [0, 0],
        [0.15, 0],
        [0.29, 1],
        [0.43, 1],
        [0.57, 0],
        [0.72, 0],
        [0.82, 0.8],
        [0.88, 0.8],
        [1, 0]
      ],
      "gaze.secondary": [
        [0, 0],
        [0.1, 0.7],
        [0.16, 0.7],
        [0.27, 0],
        [0.45, 0],
        [0.59, 0.85],
        [0.72, 0.85],
        [0.82, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.18, 0.065],
        [0.8, 0.065],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.47, 0],
        [0.493, 0.8],
        [0.53, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.475, 0],
        [0.498, 0.8],
        [0.535, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.33, 0.015],
        [0.72, 0.015],
        [0.91, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.11,
        "type": "look_to_user"
      },
      {
        "at": 0.3,
        "type": "look_to_indicator"
      },
      {
        "at": 0.6,
        "type": "return_to_user"
      },
      {
        "at": 0.83,
        "type": "look_back_to_indicator"
      }
    ],
    "acceptance": [
      "Mirada alterna entre usuario y un indicador visible al menos una vez en cada dirección.",
      "Verificar al menos una transición en cada dirección con destinos visibles y distintos."
    ],
    "status": "authored_unvalidated",
    "notes": "Alternancia usuario → indicador → usuario → indicador, con mesetas. target es el indicador visible; secondaryTarget es conversación opcional y su ausencia usa frente. Las mezclas de targets nunca suman más de uno.",
    "requiresTarget": true,
    "targetRole": "indicator",
    "secondaryTargetRole": "conversation"
  },
  {
    "id": "atento-11",
    "state": "atento",
    "label": "extender una mano con la palma abierta",
    "duration": 3.8,
    "level": "interaccion",
    "family": "palm_present",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.palmUp": [
        [0, 0],
        [0.19, 0.12],
        [0.44, 0.93],
        [0.74, 0.93],
        [1, 0]
      ],
      "hand.L.open": [
        [0, 0],
        [0.28, 0.6],
        [0.47, 1],
        [0.75, 1],
        [1, 0]
      ],
      "hand.L.roll": [
        [0, 0],
        [0.38, -0.12],
        [0.74, -0.12],
        [1, 0]
      ],
      "gaze.x": [
        [0, 0],
        [0.24, -0.1],
        [0.43, -0.1],
        [0.62, 0],
        [1, 0]
      ],
      "head.yaw": [
        [0, 0],
        [0.32, -0.04],
        [0.49, -0.04],
        [0.69, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.17, 0.04],
        [0.73, 0.04],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.31, 0.5],
        [0.8, 0.5],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.47,
        "type": "open_left_palm_presented"
      },
      {
        "at": 0.63,
        "type": "attention_returns_to_user"
      }
    ],
    "acceptance": [
      "Una mano se extiende con palma abierta legible, distinta de dedo apuntando."
    ],
    "status": "authored_unvalidated",
    "notes": "Una sola mano se extiende con palma hacia arriba y todos los dedos abiertos; la mirada la acompaña brevemente y vuelve al usuario. Sin índice prominente."
  },
  {
    "id": "atento-12",
    "state": "atento",
    "label": "acercar brevemente una mano a un lateral de su cabeza",
    "duration": 3.8,
    "level": "interaccion",
    "family": "hand_temple",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.R.temple": [
        [0, 0],
        [0.2, 0.15],
        [0.42, 0.94],
        [0.61, 0.94],
        [0.89, 0],
        [1, 0]
      ],
      "hand.R.relaxed": [
        [0, 0],
        [0.29, 0.9],
        [0.66, 0.9],
        [0.9, 0],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.4, -0.06],
        [0.63, -0.06],
        [0.9, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.28, 0.025],
        [0.5, 0.06],
        [0.64, 0.06],
        [0.9, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.16, -0.025],
        [0.65, -0.025],
        [1, 0]
      ],
      "gaze.target": [
        [0, 0],
        [0.18, 0.65],
        [0.69, 0.65],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.43,
        "type": "right_hand_near_temple"
      },
      {
        "at": 0.62,
        "type": "temple_gesture_release"
      }
    ],
    "acceptance": [
      "Una mano se acerca brevemente a un lateral de la cabeza."
    ],
    "status": "authored_unvalidated",
    "notes": "Mano derecha se acerca al lateral de la cabeza, dedos relajados y sin atravesar el mesh. Cabeza la recibe con inclinación tardía, sin transformarlo en rascar o frotar.",
    "targetRole": "conversation"
  },
  {
    "id": "atento-13",
    "state": "atento",
    "label": "realizar un gesto de descubrimiento levantando el índice",
    "duration": 3.8,
    "level": "interaccion",
    "family": "insight_index",
    "compatibleStates": [
      "atento"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.eyeOpen": [
        [0, 0],
        [0.14, -0.045],
        [0.29, -0.045],
        [0.42, 0.16],
        [0.67, 0.1],
        [1, 0]
      ],
      "face.browRaise": [
        [0, 0],
        [0.29, 0],
        [0.4, 0.025],
        [0.66, 0.025],
        [0.86, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.35, 0],
        [0.52, 0.13],
        [0.76, 0.13],
        [1, 0]
      ],
      "arm.R.indexUp": [
        [0, 0],
        [0.31, 0],
        [0.53, 1],
        [0.75, 1],
        [1, 0]
      ],
      "hand.R.point": [
        [0, 0],
        [0.37, 0.15],
        [0.55, 1],
        [0.76, 1],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.21, 0.06],
        [0.34, 0.06],
        [0.5, -0.035],
        [0.71, -0.035],
        [0.92, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.25, 0.018],
        [0.39, 0.018],
        [0.58, -0.025],
        [0.76, -0.025],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.41, 0.5],
        [0.8, 0.5],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.23,
        "type": "brief_thought_preparation"
      },
      {
        "at": 0.41,
        "type": "understanding_expression"
      },
      {
        "at": 0.55,
        "type": "discovery_index_raised"
      }
    ],
    "acceptance": [
      "Gesto de descubrimiento: índice se levanta y rostro acompaña la comprensión.",
      "La comprensión facial aparece antes de completar el índice; evitar gesto de alarma."
    ],
    "status": "authored_unvalidated",
    "notes": "Secuencia pensamiento breve → comprensión facial → índice arriba, con cambio de orientación de cabeza y torso. No es la receta atento-01 acelerada: incluye una fase previa y resolución."
  }
];
