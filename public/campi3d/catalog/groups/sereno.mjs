// Recetas 3D Campi v5. Autoría por acción; no implica validación visual.
// Los tiempos están normalizados. La anatomía ausente se declara, nunca se simula.
export const recipes = [
  {
    "id": "sereno-01",
    "state": "sereno",
    "label": "sonrisa suave con parpadeo natural",
    "duration": 4.2,
    "level": "reposo",
    "family": "soft_smile_blink",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.smile": [
        [0, 0],
        [0.13, 0.1],
        [0.4, 0.14],
        [0.8, 0.11],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.21, 0],
        [0.235, 1],
        [0.275, 0],
        [0.68, 0],
        [0.704, 0.95],
        [0.749, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.216, 0],
        [0.24, 1],
        [0.282, 0],
        [0.684, 0],
        [0.709, 1],
        [0.751, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.32, -0.012],
        [0.71, 0.009],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.24,
        "type": "first_natural_blink"
      },
      {
        "at": 0.71,
        "type": "second_irregular_blink"
      }
    ],
    "acceptance": [
      "Sonrisa suave visible; los párpados se cierran y abren con cadencia no mecánica.",
      "Comprobar cierres y aperturas independientes de ambos párpados; no usar una oscilación periódica común."
    ],
    "status": "authored_unvalidated",
    "notes": "Dos parpadeos completos con intervalos y duraciones desiguales; sonrisa estable antes, durante y después. El microajuste de cabeza no sustituye el gesto facial."
  },
  {
    "id": "sereno-02",
    "state": "sereno",
    "label": "inclinar ligeramente la cabeza hacia un lado y volver al centro",
    "duration": 3.8,
    "level": "reposo",
    "family": "head_tilt",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.x": [
        [0, 0],
        [0.13, -0.04],
        [0.43, -0.04],
        [0.66, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.16, 0],
        [0.39, -0.095],
        [0.57, -0.09],
        [0.88, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.3, 0.012],
        [0.62, 0.012],
        [0.9, 0],
        [1, 0]
      ],
      "torso.roll": [
        [0, 0],
        [0.28, 0],
        [0.5, -0.012],
        [0.79, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.23, 0.07],
        [0.69, 0.06],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.4,
        "type": "small_head_tilt_held"
      },
      {
        "at": 0.88,
        "type": "head_center_return"
      }
    ],
    "acceptance": [
      "La cabeza se inclina poco hacia un lado y retorna suavemente al centro."
    ],
    "status": "authored_unvalidated",
    "notes": "Inclinación lateral pequeña y sostenida; el torso sólo acompaña después de la cabeza. No asentimiento ni giro axial."
  },
  {
    "id": "sereno-03",
    "state": "sereno",
    "label": "mirar hacia la izquierda y después hacia el usuario",
    "duration": 3.8,
    "level": "reposo",
    "family": "gaze_side_return",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.x": [
        [0, 0],
        [0.11, -0.42],
        [0.47, -0.42],
        [0.59, 0],
        [0.86, 0],
        [1, 0]
      ],
      "gaze.target": [
        [0, 0],
        [0.53, 0],
        [0.69, 0.85],
        [0.86, 0.85],
        [1, 0]
      ],
      "head.yaw": [
        [0, 0],
        [0.16, 0],
        [0.32, -0.19],
        [0.49, -0.19],
        [0.73, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.49, 0],
        [0.517, 0.85],
        [0.555, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.495, 0],
        [0.522, 0.85],
        [0.56, 0],
        [1, 0]
      ],
      "torso.yaw": [
        [0, 0],
        [0.24, 0],
        [0.41, -0.018],
        [0.7, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.12,
        "type": "eyes_lead_left"
      },
      {
        "at": 0.34,
        "type": "head_follows_left"
      },
      {
        "at": 0.7,
        "type": "return_to_user"
      }
    ],
    "acceptance": [
      "La mirada viaja a la izquierda y después vuelve al frente/usuario; no basta un cambio de cabeza sin mirada."
    ],
    "status": "authored_unvalidated",
    "notes": "Primero viajan los ojos a la izquierda y luego la cabeza. target opcional es el usuario; sin target el retorno es al frente, como admite el criterio. No hace falta mover los pies.",
    "targetRole": "conversation"
  },
  {
    "id": "sereno-04",
    "state": "sereno",
    "label": "balancearse discretamente sobre sus pies",
    "duration": 4.7,
    "level": "reposo",
    "family": "subtle_sway",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "body.shiftX": [
        [0, 0],
        [0.18, -0.021],
        [0.41, 0.023],
        [0.64, -0.018],
        [0.83, 0.011],
        [1, 0]
      ],
      "torso.roll": [
        [0, 0],
        [0.22, 0.009],
        [0.45, -0.01],
        [0.68, 0.008],
        [0.88, -0.004],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.27, -0.006],
        [0.5, 0.006],
        [0.73, -0.004],
        [1, 0]
      ],
      "arm.L.rest": [
        [0, 0],
        [0.17, 0.35],
        [0.79, 0.35],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.22, 0.35],
        [0.83, 0.35],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.55, 0],
        [0.575, 1],
        [0.61, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.553, 0],
        [0.58, 1],
        [0.615, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.18,
        "type": "left_sway_extremum"
      },
      {
        "at": 0.41,
        "type": "right_sway_extremum"
      },
      {
        "at": 0.64,
        "type": "damped_left_sway"
      }
    ],
    "acceptance": [
      "El cuerpo oscila con amplitud discreta; los pies permanecen en su zona de apoyo.",
      "Ambos pies conservan sus anclas durante toda la oscilación."
    ],
    "status": "authored_unvalidated",
    "notes": "Balanceo continuo pequeño con amortiguación y contrapeso de torso/cabeza, sin pausas de apoyo unipodal ni canales de paso."
  },
  {
    "id": "sereno-05",
    "state": "sereno",
    "label": "cambiar el peso del cuerpo de una pierna a otra",
    "duration": 4.5,
    "level": "reposo",
    "family": "weight_shift",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "body.shiftX": [
        [0, 0],
        [0.16, -0.037],
        [0.39, -0.037],
        [0.56, 0.041],
        [0.79, 0.041],
        [1, 0]
      ],
      "body.height": [
        [0, 0],
        [0.12, -0.005],
        [0.38, -0.005],
        [0.48, 0.002],
        [0.6, -0.006],
        [0.79, -0.006],
        [1, 0]
      ],
      "torso.roll": [
        [0, 0],
        [0.21, 0.016],
        [0.4, 0.016],
        [0.62, -0.018],
        [0.8, -0.018],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.26, 0.018],
        [0.39, 0.018],
        [0.62, -0.014],
        [0.83, -0.014],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.23, -0.016],
        [0.4, -0.016],
        [0.65, 0.02],
        [0.82, 0.02],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.3, -0.011],
        [0.42, -0.011],
        [0.68, 0.012],
        [0.83, 0.012],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.2,
        "type": "left_support_hold"
      },
      {
        "at": 0.6,
        "type": "right_support_hold"
      },
      {
        "at": 0.94,
        "type": "weight_recenters"
      }
    ],
    "acceptance": [
      "El peso cambia de una pierna a la otra, distinguiéndose del balanceo simétrico.",
      "Los pies siguen plantados; la pelvis se desplaza lateralmente dentro de la base de soporte."
    ],
    "status": "authored_unvalidated",
    "notes": "Dos apoyos asimétricos con mesetas legibles, transferencia central más rápida y compensación escapular. Se distingue del balanceo continuo por la pausa sobre cada pierna."
  },
  {
    "id": "sereno-06",
    "state": "sereno",
    "label": "mantener las manos juntas delante del cuerpo",
    "duration": 3.8,
    "level": "reposo",
    "family": "hands_together",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.handsFront": [
        [0, 0],
        [0.12, 0.12],
        [0.33, 1],
        [0.76, 1],
        [1, 0]
      ],
      "arm.R.handsFront": [
        [0, 0],
        [0.17, 0.08],
        [0.39, 1],
        [0.76, 1],
        [1, 0]
      ],
      "hand.L.cup": [
        [0, 0],
        [0.26, 0.7],
        [0.7, 0.7],
        [0.88, 0.25],
        [1, 0]
      ],
      "hand.R.cup": [
        [0, 0],
        [0.31, 0.75],
        [0.7, 0.75],
        [0.88, 0.25],
        [1, 0]
      ],
      "hand.L.roll": [
        [0, 0],
        [0.34, 0.08],
        [0.74, 0.08],
        [1, 0]
      ],
      "hand.R.roll": [
        [0, 0],
        [0.4, -0.08],
        [0.74, -0.08],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.22, 0.035],
        [0.5, 0.018],
        [0.85, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.28, 0.08],
        [0.78, 0.08],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.4,
        "type": "hands_together_front"
      },
      {
        "at": 0.73,
        "type": "hands_hold_ends"
      }
    ],
    "acceptance": [
      "Ambas manos se sitúan juntas delante del cuerpo y permanecen legibles.",
      "Las manos deben quedar próximas y legibles sin interpenetrarse; verificar la distancia en el modelo."
    ],
    "status": "authored_unvalidated",
    "notes": "Convergencia lenta a la pose real de manos juntas delante del torso, con dedos curvados y un sostén prolongado. Sin golpe, rebote ni evento de palmada."
  },
  {
    "id": "sereno-07",
    "state": "sereno",
    "label": "apoyar una mano sobre la cintura",
    "duration": 3.8,
    "level": "reposo",
    "family": "hand_waist",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "arm.L.hip": [
        [0, 0],
        [0.14, 0.08],
        [0.39, 1],
        [0.78, 1],
        [1, 0]
      ],
      "hand.L.relaxed": [
        [0, 0],
        [0.3, 0.75],
        [0.79, 0.75],
        [1, 0]
      ],
      "hand.L.roll": [
        [0, 0],
        [0.38, -0.06],
        [0.78, -0.06],
        [1, 0]
      ],
      "arm.R.rest": [
        [0, 0],
        [0.24, 0.5],
        [0.81, 0.5],
        [1, 0]
      ],
      "body.shiftX": [
        [0, 0],
        [0.23, 0],
        [0.45, -0.018],
        [0.76, -0.018],
        [1, 0]
      ],
      "torso.roll": [
        [0, 0],
        [0.32, 0],
        [0.54, 0.01],
        [0.81, 0.01],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.4, -0.028],
        [0.74, -0.028],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.4,
        "type": "left_hand_on_waist"
      },
      {
        "at": 0.79,
        "type": "waist_hold_ends"
      }
    ],
    "acceptance": [
      "Una mano llega a la cintura; se distingue de la pose de manos juntas."
    ],
    "status": "authored_unvalidated",
    "notes": "Una sola mano se apoya en la cintura; la contraria queda baja. Peso y cabeza acompañan después, sin repetir manos juntas."
  },
  {
    "id": "sereno-08",
    "state": "sereno",
    "label": "mover suavemente la antena",
    "duration": 3.8,
    "level": "reposo",
    "family": "sensor_microgesture",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {},
    "events": [],
    "acceptance": [
      "La antena se mueve con amplitud suave e independiente.",
      "No reproducir ni declarar cumplida mientras el modelo no tenga una antena animable real."
    ],
    "status": "blocked_anatomy",
    "notes": "NO DISPONIBLE: el GLB actual no tiene antena ni hueso/mesh de antena. Se conserva la entrada original sin sustituirla por cabeza, ojos o sensor. Requiere incorporar y validar anatomía de antena antes de reproducirse.",
    "requiredCapabilities": [
      "antenna"
    ],
    "unavailableReason": "El modelo Campi actual carece de antena animable.",
    "available": false
  },
  {
    "id": "sereno-09",
    "state": "sereno",
    "label": "realizar una pequeña respiración simulada",
    "duration": 4.5,
    "level": "reposo",
    "family": "breathing",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "torso.pitch": [
        [0, 0],
        [0.16, -0.006],
        [0.42, -0.02],
        [0.53, -0.02],
        [0.87, 0],
        [1, 0]
      ],
      "shoulder.L.lift": [
        [0, 0],
        [0.22, 0.013],
        [0.45, 0.035],
        [0.54, 0.033],
        [0.88, 0],
        [1, 0]
      ],
      "shoulder.R.lift": [
        [0, 0],
        [0.24, 0.011],
        [0.47, 0.032],
        [0.56, 0.03],
        [0.9, 0],
        [1, 0]
      ],
      "body.height": [
        [0, 0],
        [0.29, 0.0015],
        [0.48, 0.0035],
        [0.57, 0.003],
        [0.91, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.34, 0.005],
        [0.57, 0.008],
        [0.94, 0],
        [1, 0]
      ],
      "face.eyeOpen": [
        [0, 0],
        [0.51, -0.035],
        [0.77, -0.035],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.46,
        "type": "small_inhalation_peak"
      },
      {
        "at": 0.87,
        "type": "long_exhale_release"
      }
    ],
    "acceptance": [
      "Hay expansión/contracción corporal sutil, sin salto ni desplazamiento.",
      "Comprobar expansión/contracción de la silueta y contacto permanente de pies; no aceptar sólo una traslación rígida."
    ],
    "status": "authored_unvalidated",
    "notes": "Una inspiración lenta expande la silueta superior con hombros y extensión torácica mínima; exhalación más larga. Elevación corporal submilimétrica/milimétrica sin vuelo, salto ni traslación horizontal."
  },
  {
    "id": "sereno-10",
    "state": "sereno",
    "label": "mirar brevemente hacia arriba como si estuviera observando algo",
    "duration": 3.8,
    "level": "reposo",
    "family": "gaze_up",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "gaze.y": [
        [0, 0],
        [0.14, 0.38],
        [0.4, 0.38],
        [0.58, 0],
        [1, 0]
      ],
      "head.pitch": [
        [0, 0],
        [0.21, 0],
        [0.34, -0.085],
        [0.49, -0.085],
        [0.72, 0],
        [1, 0]
      ],
      "face.browRaise": [
        [0, 0],
        [0.22, 0.007],
        [0.43, 0.007],
        [0.66, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.61, 0],
        [0.635, 0.9],
        [0.68, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.615, 0],
        [0.64, 0.9],
        [0.685, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.15,
        "type": "eyes_look_up"
      },
      {
        "at": 0.6,
        "type": "eyes_return_front"
      }
    ],
    "acceptance": [
      "Los ojos miran brevemente arriba y regresan."
    ],
    "status": "authored_unvalidated",
    "notes": "Mirada breve hacia arriba con ojos anticipando la pequeña elevación de cabeza. Cejas neutras-curiosas, sin celebración."
  },
  {
    "id": "sereno-11",
    "state": "sereno",
    "label": "hacer un asentimiento muy ligero",
    "duration": 3.8,
    "level": "reposo",
    "family": "nod",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "head.pitch": [
        [0, 0],
        [0.2, -0.014],
        [0.41, 0.075],
        [0.59, 0.018],
        [0.76, 0],
        [1, 0]
      ],
      "gaze.y": [
        [0, 0],
        [0.28, -0.025],
        [0.49, -0.025],
        [0.7, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.15, 0.045],
        [0.65, 0.045],
        [1, 0]
      ],
      "torso.pitch": [
        [0, 0],
        [0.33, 0],
        [0.5, 0.008],
        [0.8, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.41,
        "type": "single_light_nod_bottom"
      },
      {
        "at": 0.77,
        "type": "head_recentered"
      }
    ],
    "acceptance": [
      "La cabeza realiza un asentimiento muy leve y vuelve al centro."
    ],
    "status": "authored_unvalidated",
    "notes": "Un único asentimiento muy leve, precedido de preparación casi imperceptible y retorno sin rebote. El torso no genera un segundo asentimiento."
  },
  {
    "id": "sereno-12",
    "state": "sereno",
    "label": "entrecerrar los ojos durante un instante con expresión relajada",
    "duration": 3.8,
    "level": "reposo",
    "family": "squint",
    "compatibleStates": [
      "sereno"
    ],
    "seriousAllowed": true,
    "tracks": {
      "face.eyeOpen": [
        [0, 0],
        [0.16, -0.07],
        [0.32, -0.26],
        [0.53, -0.26],
        [0.76, 0],
        [1, 0]
      ],
      "face.blinkL": [
        [0, 0],
        [0.24, 0.12],
        [0.39, 0.26],
        [0.57, 0.22],
        [0.79, 0],
        [1, 0]
      ],
      "face.blinkR": [
        [0, 0],
        [0.26, 0.12],
        [0.41, 0.25],
        [0.58, 0.22],
        [0.8, 0],
        [1, 0]
      ],
      "face.smile": [
        [0, 0],
        [0.21, 0.1],
        [0.62, 0.1],
        [0.88, 0],
        [1, 0]
      ],
      "head.roll": [
        [0, 0],
        [0.38, 0.022],
        [0.64, 0.022],
        [0.9, 0],
        [1, 0]
      ]
    },
    "events": [
      {
        "at": 0.4,
        "type": "relaxed_partial_squint"
      },
      {
        "at": 0.81,
        "type": "eyes_reopen"
      }
    ],
    "acceptance": [
      "Los ojos se entrecierran brevemente con rostro relajado, distinto de cerrar/parpadear por completo.",
      "Los párpados dejan visible parte de los ojos durante el entrecierre."
    ],
    "status": "authored_unvalidated",
    "notes": "Entrecierre sostenido y suave, nunca cierre total. Se evita frown y se mantiene una sonrisa pequeña para no confundirse con preocupación."
  }
];
