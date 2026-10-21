// Recetas 3D Campi v5. Autoría por acción; no implica validación visual.
// Los tiempos están normalizados. La anatomía ausente se declara, nunca se simula.
export const recipes = [
  {
    "id": "contento-01",
    "state": "contento",
    "label": "sonreír ampliamente y levantar un pulgar",
    "duration": 3.8,
    "level": "interaccion",
    "family": "thumb_up",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.16, 0.28],
        [0.54, 0.32],
        [0.79, 0.26],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.18, 0.07],
        [0.57, 0.04],
        [0.84, 0],
        [1, 0]
      ],
      "arm.R.fistUp": [
        [0, 0],
        [0.17, 0.1],
        [0.37, 0.82],
        [0.73, 0.82],
        [1, 0]
      ],
      "hand.R.thumbUp": [
        [0, 0],
        [0.27, 0.3],
        [0.42, 1],
        [0.74, 1],
        [0.9, 0.2],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.39, -0.1],
        [0.75, -0.1],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.24, -0.025],
        [0.55, 0.045],
        [0.77, 0],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.31, 0.35],
        [0.8, 0.35],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.42,
        "type": "thumb_up_and_broad_smile"
      },
      {
        "at": 0.74,
        "type": "success_hold_ends"
      }
    ],
    "acceptance": [
      "Sonrisa amplia y un pulgar reconocible arriba coinciden.",
      "Comprobar pulgar anatómico extendido y cuatro dedos plegados durante el sostén."
    ],
    "status": "authored_unvalidated",
    "notes": "Brazo derecho se eleva primero; el pulgar se abre después mientras los otros cuatro dedos permanecen plegados. La sonrisa amplia coincide con el pulgar, no con un índice."
  },
  {
    "id": "contento-02",
    "state": "contento",
    "label": "levantar ambos brazos brevemente",
    "duration": 3.8,
    "level": "interaccion",
    "family": "arms_raise",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.11, 0.2],
        [0.51, 0.25],
        [0.78, 0.1],
        [1, 0]
      ],
      "arm.L.raise": [
        [0, 0],
        [0.15, 0.16],
        [0.38, 1],
        [0.57, 1],
        [0.85, 0],
        [1, 0]
      ],
      "arm.R.raise": [
        [0, 0],
        [0.19, 0.15],
        [0.42, 1],
        [0.57, 1],
        [0.89, 0],
        [1, 0]
      ],
      "hand.L.open": [
        [0, 0],
        [0.27, 0.85],
        [0.65, 0.85],
        [0.89, 0],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.3, 0.85],
        [0.65, 0.85],
        [0.91, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.28, -0.025],
        [0.56, -0.025],
        [0.87, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.36, -0.03],
        [0.6, -0.03],
        [0.9, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.42,
        "type": "both_arms_raised"
      },
      {
        "at": 0.59,
        "type": "raised_arms_release"
      }
    ],
    "acceptance": [
      "Ambos brazos suben brevemente y regresan, sin abandonar el anclaje."
    ],
    "status": "authored_unvalidated",
    "notes": "Elevación bilateral sobre hombros con pequeño desfase de llegada y regreso controlado. Pies anclados, sin canales de salto."
  },
  {
    "id": "contento-03",
    "state": "contento",
    "label": "cerrar los ojos con una sonrisa",
    "duration": 3.8,
    "level": "interaccion",
    "family": "smile_eyes_closed",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.15, 0.29],
        [0.53, 0.34],
        [0.78, 0.25],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.23, 0],
        [0.32, 1],
        [0.62, 1],
        [0.76, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.245, 0],
        [0.34, 1],
        [0.63, 1],
        [0.78, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.27, 0.035],
        [0.57, 0.035],
        [0.84, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.4, -0.02],
        [0.65, -0.02],
        [0.9, 0],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.37, -0.012],
        [0.69, -0.012],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.4, -0.012],
        [0.71, -0.012],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.35,
        "type": "happy_eyes_closed_hold"
      },
      {
        "at": 0.79,
        "type": "eyes_open_smile_remains"
      }
    ],
    "acceptance": [
      "Ojos cerrados con sonrisa visible; no cambia a expresión de preocupación."
    ],
    "status": "authored_unvalidated",
    "notes": "Sonrisa amplia comienza antes del cierre; ambos ojos permanecen cerrados y se abren antes de desaparecer la sonrisa. Sin ceño ni hombros tensos."
  },
  {
    "id": "contento-04",
    "state": "contento",
    "label": "hacer un pequeño movimiento de hombros de satisfacción",
    "duration": 3.8,
    "level": "interaccion",
    "family": "shoulder_satisfaction",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.13, 0.2],
        [0.67, 0.2],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.18, 0],
        [0.3, 0.095],
        [0.45, 0.095],
        [0.63, -0.025],
        [0.8, 0],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.2, 0],
        [0.34, 0.085],
        [0.48, 0.085],
        [0.66, -0.022],
        [0.83, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.36, -0.035],
        [0.61, -0.035],
        [0.86, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.36, 0],
        [0.39, 0.65],
        [0.47, 0.65],
        [0.51, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.37, 0],
        [0.4, 0.65],
        [0.48, 0.65],
        [0.52, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.34,
        "type": "satisfied_shoulder_lift"
      },
      {
        "at": 0.66,
        "type": "small_shoulder_release"
      }
    ],
    "acceptance": [
      "Pequeño gesto de hombros de satisfacción, sin confundirlo con respiración."
    ],
    "status": "authored_unvalidated",
    "notes": "Un gesto de satisfacción de hombros, con elevación localizada, pausa y pequeña caída. Sin elevación del cuerpo ni ciclo de respiración torácica."
  },
  {
    "id": "contento-05",
    "state": "contento",
    "label": "dar una palmada suave",
    "duration": 3.8,
    "level": "interaccion",
    "family": "soft_clap",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.15, 0.2],
        [0.69, 0.22],
        [1, 0]
      ],
      "arm.L.clap": [
        [0, 0],
        [0.2, 0.53],
        [0.34, 0.53],
        [0.43, 1],
        [0.58, 1],
        [0.74, 0.47],
        [0.85, 0.47],
        [1, 0]
      ],
      "arm.R.clap": [
        [0, 0],
        [0.23, 0.53],
        [0.34, 0.53],
        [0.43, 1],
        [0.58, 1],
        [0.76, 0.47],
        [0.85, 0.47],
        [1, 0]
      ],
      "hand.L.clap": [
        [0, 0],
        [0.26, 1],
        [0.72, 1],
        [0.8, 0.35],
        [1, 0]
      ],
      "hand.R.clap": [
        [0, 0],
        [0.29, 1],
        [0.74, 1],
        [0.81, 0.35],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.32, -0.018],
        [0.48, 0.045],
        [0.72, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.36, 0],
        [0.5, 0.012],
        [0.76, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.34,
        "type": "hands_ready_apart"
      },
      {
        "at": 0.62,
        "type": "single_soft_clap_contact"
      },
      {
        "at": 0.67,
        "type": "hands_separate"
      }
    ],
    "acceptance": [
      "Ambas manos se acercan, hacen una palmada suave y se separan; sin aplauso frenético.",
      "Verificar una única mínima distancia entre las palmas sin interpenetración sostenida."
    ],
    "status": "authored_unvalidated",
    "notes": "Una sola palmada: preparación separada, convergencia breve, contacto real y separación. No simular sonido como sustituto del contacto ni repetir el golpe."
  },
  {
    "id": "contento-06",
    "state": "contento",
    "label": "levantar un puño en señal de logro",
    "duration": 3.8,
    "level": "interaccion",
    "family": "fist_raise",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "hand.R.fist": [
        [0, 0],
        [0.13, 0.75],
        [0.23, 1],
        [0.76, 1],
        [0.92, 0.15],
        [1, 0]
      ],
      "arm.R.fistUp": [
        [0, 0],
        [0.19, 0],
        [0.4, 1],
        [0.61, 1],
        [0.78, 0.65],
        [1, 0]
      ],
      "arm.L.hip": [
        [0, 0],
        [0.24, 0.6],
        [0.72, 0.6],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.17, 0.24],
        [0.64, 0.29],
        [0.84, 0.12],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.3, -0.05],
        [0.63, -0.05],
        [0.91, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.34, -0.025],
        [0.68, -0.025],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.23,
        "type": "fist_closes_before_raise"
      },
      {
        "at": 0.42,
        "type": "achievement_fist_held"
      }
    ],
    "acceptance": [
      "Un puño cerrado se eleva, distinguible del índice y del pulgar."
    ],
    "status": "authored_unvalidated",
    "notes": "Los cinco dedos se cierran antes de elevar el puño. Postura de logro localizada a un brazo, distinta de thumbUp e indexUp; sin salto."
  },
  {
    "id": "contento-07",
    "state": "contento",
    "label": "realizar un pequeño salto sin desplazarse",
    "duration": 3.6,
    "level": "especial",
    "family": "jump",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.18, 0.21],
        [0.43, 0.3],
        [0.68, 0.3],
        [0.87, 0.15],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.23, 0.04],
        [0.43, 0.12],
        [0.61, 0.1],
        [0.82, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.78, 0],
        [0.805, 0.8],
        [0.85, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.785, 0],
        [0.81, 0.8],
        [0.855, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.2,
        "type": "approved_jump_anticipation"
      },
      {
        "at": 0.5,
        "type": "approved_jump_airborne_window"
      },
      {
        "at": 0.8,
        "type": "approved_jump_landing_window"
      }
    ],
    "acceptance": [
      "Pequeño salto vertical; origen y destino horizontal iguales; Campi nunca sale del encuadre.",
      "Comprobar en el movimiento continuo la liberación de pies durante vuelo y recuperación de las mismas anclas al aterrizar."
    ],
    "status": "authored_unvalidated",
    "notes": "Reutiliza approvedJump del salto 3D validado. No se añaden curvas de pelvis, piernas ni brazos que sobrescriban anticipación/vuelo/aterrizaje. Eventos indican ventanas nominales; el clip especial es la fuente de contacto real.",
    "special": "approvedJump"
  },
  {
    "id": "contento-08",
    "state": "contento",
    "label": "dar una vuelta corta sobre su eje y recuperar su posición original",
    "duration": 4.4,
    "level": "especial",
    "family": "axial_turn",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.14, 0.2],
        [0.49, 0.24],
        [0.8, 0.19],
        [1, 0]
      ],
      "gaze.x": [
        [0, 0],
        [0.12, 0.12],
        [0.26, 0.15],
        [0.43, 0],
        [0.57, -0.12],
        [0.75, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.82, 0],
        [0.843, 0.85],
        [0.88, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.825, 0],
        [0.848, 0.85],
        [0.885, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.15,
        "type": "short_turn_prepare"
      },
      {
        "at": 0.5,
        "type": "short_turn_reverse"
      },
      {
        "at": 0.92,
        "type": "short_turn_recovered"
      }
    ],
    "acceptance": [
      "Giro corto sobre el propio eje con recuperación de orientación y posición originales; no órbita ni salida.",
      "Verificar pie de pivote/pie libre en cada fase, orientación y posición originales al terminar y ausencia de órbita."
    ],
    "status": "authored_unvalidated",
    "notes": "shortTurn controla pelvis, pivote y pasos reales de ida/vuelta. Las capas adicionales son sólo mirada y expresión, para no torcer los pies ni convertir la vuelta en giro de torso.",
    "special": "shortTurn"
  },
  {
    "id": "contento-09",
    "state": "contento",
    "label": "llevar una mano al pecho con expresión orgullosa",
    "duration": 3.8,
    "level": "interaccion",
    "family": "hand_chest",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.15, 0.23],
        [0.68, 0.25],
        [1, 0]
      ],
      "arm.R.chest": [
        [0, 0],
        [0.19, 0.14],
        [0.39, 1],
        [0.76, 1],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.27, 0.78],
        [0.77, 0.78],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.36, 0.06],
        [0.76, 0.06],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.28, -0.045],
        [0.67, -0.045],
        [0.92, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.44, -0.06],
        [0.69, -0.06],
        [0.95, 0],
        [1, 0]
      ],
      "arm.L.hip": [
        [0, 0],
        [0.31, 0.45],
        [0.74, 0.45],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.4,
        "type": "proud_hand_to_chest"
      },
      {
        "at": 0.68,
        "type": "proud_posture_held"
      }
    ],
    "acceptance": [
      "Una mano alcanza el pecho con expresión/postura orgullosa."
    ],
    "status": "authored_unvalidated",
    "notes": "Mano derecha abierta al pecho y mentón ligeramente elevado después; extensión corporal orgullosa, sin puño ni asentimiento de alivio."
  },
  {
    "id": "contento-10",
    "state": "contento",
    "label": "asentir dos veces",
    "duration": 3.8,
    "level": "interaccion",
    "family": "double_nod",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "head.pitch": [
        [0, 0],
        [0.15, -0.035],
        [0.29, 0.16],
        [0.43, -0.025],
        [0.57, 0.15],
        [0.73, 0],
        [1, 0]
      ],
      "gaze.y": [
        [0, 0],
        [0.22, -0.04],
        [0.33, -0.04],
        [0.43, 0],
        [0.51, -0.04],
        [0.62, -0.04],
        [0.76, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.12, 0.23],
        [0.69, 0.26],
        [0.87, 0.13],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.19, 0.008],
        [0.61, 0.008],
        [0.82, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.29,
        "type": "first_nod_bottom"
      },
      {
        "at": 0.43,
        "type": "between_nods"
      },
      {
        "at": 0.57,
        "type": "second_nod_bottom"
      },
      {
        "at": 0.74,
        "type": "double_nod_finished"
      }
    ],
    "acceptance": [
      "Se completan exactamente dos asentimientos identificables.",
      "Contar dos asentimientos identificables en la cabeza, no dos rebotes secundarios del cuerpo."
    ],
    "status": "authored_unvalidated",
    "notes": "Exactamente dos máximos positivos de pitch, separados por recuperación hacia arriba; torso sostenido sin duplicar los ciclos."
  },
  {
    "id": "contento-11",
    "state": "contento",
    "label": "mirar hacia arriba con alegría",
    "duration": 3.8,
    "level": "interaccion",
    "family": "gaze_up",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.12, 0.26],
        [0.64, 0.3],
        [0.87, 0.13],
        [1, 0]
      ],
      "gaze.y": [
        [0, 0],
        [0.2, 0.43],
        [0.56, 0.43],
        [0.75, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.25, -0.03],
        [0.41, -0.14],
        [0.61, -0.14],
        [0.87, 0],
        [1, 0]
      ],
      "face.browRaise": [
        [0, 0],
        [0.24, 0.015],
        [0.59, 0.015],
        [0.8, 0],
        [1, 0]
      ],
      "arm.L.open": [
        [0, 0],
        [0.32, 0.2],
        [0.62, 0.2],
        [0.86, 0],
        [1, 0]
      ],
      "arm.R.open": [
        [0, 0],
        [0.36, 0.2],
        [0.65, 0.2],
        [0.9, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.21,
        "type": "happy_upward_gaze"
      },
      {
        "at": 0.42,
        "type": "head_follows_eyes_up"
      }
    ],
    "acceptance": [
      "Mirada hacia arriba con expresión alegre."
    ],
    "status": "authored_unvalidated",
    "notes": "Sonrisa anticipa la mirada alta; brazos se abren levemente después para acompañar la alegría. No es sólo la mirada neutra con más amplitud."
  },
  {
    "id": "contento-12",
    "state": "contento",
    "label": "extender los brazos como presentando una buena noticia",
    "duration": 3.8,
    "level": "interaccion",
    "family": "arms_present",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.12, 0.24],
        [0.68, 0.28],
        [1, 0]
      ],
      "arm.L.open": [
        [0, 0],
        [0.18, 0.1],
        [0.4, 0.9],
        [0.73, 0.9],
        [1, 0]
      ],
      "arm.R.open": [
        [0, 0],
        [0.22, 0.12],
        [0.45, 0.9],
        [0.73, 0.9],
        [1, 0]
      ],
      "hand.L.open": [
        [0, 0],
        [0.31, 0.9],
        [0.76, 0.9],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.34, 0.9],
        [0.76, 0.9],
        [1, 0]
      ],
      "hand.L.roll": [
        [0, 0],
        [0.41, -0.16],
        [0.74, -0.16],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.46, 0.16],
        [0.74, 0.16],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.28, 0.03],
        [0.53, -0.035],
        [0.81, 0],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.34, -0.025],
        [0.74, -0.025],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.45,
        "type": "both_arms_present_good_news"
      },
      {
        "at": 0.74,
        "type": "presentation_hold_ends"
      }
    ],
    "acceptance": [
      "Ambos brazos se extienden como presentando una noticia, distinto de subirlos sobre la cabeza."
    ],
    "status": "authored_unvalidated",
    "notes": "Apertura bilateral a los lados y delante con palmas visibles, debajo de la elevación celebratoria. No se emplea raise ni pose sobre la cabeza."
  },
  {
    "id": "contento-13",
    "state": "contento",
    "label": "realizar una pequeña reverencia",
    "duration": 4.6,
    "level": "especial",
    "family": "bow",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.13, 0.2],
        [0.74, 0.2],
        [1, 0]
      ],
      "arm.L.behind": [
        [0, 0],
        [0.18, 0.75],
        [0.7, 0.75],
        [1, 0]
      ],
      "arm.R.chest": [
        [0, 0],
        [0.25, 0.8],
        [0.7, 0.8],
        [1, 0]
      ],
      "hand.R.open": [
        [0, 0],
        [0.3, 0.7],
        [0.71, 0.7],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.22, 0],
        [0.45, 0.18],
        [0.58, 0.18],
        [0.86, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.29, 0.02],
        [0.5, 0.07],
        [0.62, 0.07],
        [0.9, 0],
        [1, 0]
      ],
      "body.shiftY": [
        [0, 0],
        [0.34, 0.008],
        [0.52, 0.022],
        [0.63, 0.022],
        [0.87, 0],
        [1, 0]
      ],
      "gaze.y": [
        [0, 0],
        [0.36, -0.12],
        [0.62, -0.12],
        [0.82, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.3,
        "type": "bow_hands_prepared"
      },
      {
        "at": 0.51,
        "type": "small_bow_low_point"
      },
      {
        "at": 0.9,
        "type": "upright_return"
      }
    ],
    "acceptance": [
      "Pequeña reverencia mediante inclinación del cuerpo y retorno, sin desanclar."
    ],
    "status": "authored_unvalidated",
    "notes": "Reverencia corta: mano al pecho y otra atrás antes de inclinar el torso. Pelvis compensa mínimamente hacia atrás para conservar anclas, y cabeza termina su retorno después del torso."
  },
  {
    "id": "contento-14",
    "state": "contento",
    "label": "mostrar una sonrisa asimétrica con un guiño",
    "duration": 3.8,
    "level": "interaccion",
    "family": "wink_asymmetric_smile",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smirk": [
        [0, 0],
        [0.17, 0.07],
        [0.3, 0.14],
        [0.61, 0.14],
        [0.86, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.18, 0.18],
        [0.65, 0.18],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.29, 0],
        [0.37, 1],
        [0.48, 1],
        [0.6, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [1, 0]
      ],
      "face.browL": [
        [0, 0],
        [0.25, -0.03],
        [0.55, -0.03],
        [0.81, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.28, -0.025],
        [0.43, -0.075],
        [0.67, -0.075],
        [0.89, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.38,
        "type": "right_eye_wink_with_smirk"
      },
      {
        "at": 0.61,
        "type": "wink_opens"
      }
    ],
    "acceptance": [
      "Sonrisa asimétrica acompañada de guiño unilateral; no parpadeo bilateral.",
      "No permitir cierre bilateral por parpadeo de reposo durante la ventana de guiño."
    ],
    "status": "authored_unvalidated",
    "notes": "Guiño sólo derecho con boca asimétrica ya visible; ojo izquierdo abierto durante toda la acción. La inclinación lateral llega después del comienzo de la sonrisa."
  },
  {
    "id": "contento-15",
    "state": "contento",
    "label": "hacer un movimiento corto y alegre con los pies",
    "duration": 3.8,
    "level": "especial",
    "family": "happy_feet",
    "compatibleStates": [
      "contento"
    ],
    "seriousAllowed": false,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.1, 0.23],
        [0.69, 0.26],
        [1, 0]
      ],
      "body.shiftX": [
        [0, 0],
        [0.18, 0.025],
        [0.39, 0.025],
        [0.49, -0.026],
        [0.72, -0.026],
        [0.9, 0],
        [1, 0]
      ],
      "foot.L.lift": [
        [0, 0],
        [0.17, 0],
        [0.26, 0.055],
        [0.34, 0.055],
        [0.43, 0],
        [1, 0]
      ],
      "foot.L.side": [
        [0, 0],
        [0.2, 0],
        [0.28, -0.025],
        [0.34, -0.025],
        [0.4, 0],
        [1, 0]
      ],
      "foot.L.pitch": [
        [0, 0],
        [0.23, 0.1],
        [0.33, -0.06],
        [0.43, 0],
        [1, 0]
      ],
      "foot.R.lift": [
        [0, 0],
        [0.49, 0],
        [0.58, 0.06],
        [0.66, 0.06],
        [0.75, 0],
        [1, 0]
      ],
      "foot.R.side": [
        [0, 0],
        [0.52, 0],
        [0.6, 0.027],
        [0.66, 0.027],
        [0.72, 0],
        [1, 0]
      ],
      "foot.R.pitch": [
        [0, 0],
        [0.55, 0.11],
        [0.65, -0.065],
        [0.75, 0],
        [1, 0]
      ],
      "arm.L.open": [
        [0, 0],
        [0.21, 0.25],
        [0.7, 0.25],
        [0.91, 0],
        [1, 0]
      ],
      "arm.R.open": [
        [0, 0],
        [0.24, 0.25],
        [0.74, 0.25],
        [0.93, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.31, -0.035],
        [0.48, 0],
        [0.63, 0.035],
        [0.87, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.18,
        "type": "weight_on_right_before_left_lift"
      },
      {
        "at": 0.29,
        "type": "left_foot_playful_lift"
      },
      {
        "at": 0.44,
        "type": "left_foot_replanted"
      },
      {
        "at": 0.5,
        "type": "weight_on_left_before_right_lift"
      },
      {
        "at": 0.61,
        "type": "right_foot_playful_lift"
      },
      {
        "at": 0.76,
        "type": "right_foot_replanted"
      }
    ],
    "acceptance": [
      "Movimiento corto y alegre de pies visible, sin caminar fuera de la posición.",
      "Nunca ambos pies libres simultáneamente; las anclas finales coinciden con las originales."
    ],
    "status": "authored_unvalidated",
    "notes": "Dos pasos alegres en el sitio, uno por pie. Antes de cada elevación el peso pasa al pie contrario; los desplazamientos laterales regresan mientras el pie sigue en aire, antes del contacto."
  }
];
