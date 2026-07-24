export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          answer_mode: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          page_context: Json
          role: string
          sources: Json
          user_id: string
        }
        Insert: {
          answer_mode?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          page_context?: Json
          role: string
          sources?: Json
          user_id: string
        }
        Update: {
          answer_mode?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          page_context?: Json
          role?: string
          sources?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tool_runs: {
        Row: {
          conversation_id: string
          created_at: string
          duration_ms: number
          error: string | null
          filters: Json
          id: string
          result_count: number
          tool_name: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          filters?: Json
          id?: string
          result_count?: number
          tool_name: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          duration_ms?: number
          error?: string | null
          filters?: Json
          id?: string
          result_count?: number
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          completion_tokens: number
          conversation_id: string | null
          created_at: string
          estimated_cost_usd: number | null
          id: string
          latency_ms: number
          model: string
          prompt_tokens: number
          status: string
          total_tokens: number
          user_id: string
        }
        Insert: {
          completion_tokens?: number
          conversation_id?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          latency_ms?: number
          model?: string
          prompt_tokens?: number
          status?: string
          total_tokens?: number
          user_id: string
        }
        Update: {
          completion_tokens?: number
          conversation_id?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          latency_ms?: number
          model?: string
          prompt_tokens?: number
          status?: string
          total_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          cod_entidad: string | null
          correo_principal: string | null
          creado_en: string
          direccion: string | null
          id: string
          localidad: string | null
          nombre: string
          region: string | null
          ruc: string | null
          sucursal: Database["public"]["Enums"]["sucursal"] | null
        }
        Insert: {
          activo?: boolean
          cod_entidad?: string | null
          correo_principal?: string | null
          creado_en?: string
          direccion?: string | null
          id?: string
          localidad?: string | null
          nombre: string
          region?: string | null
          ruc?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
        }
        Update: {
          activo?: boolean
          cod_entidad?: string | null
          correo_principal?: string | null
          creado_en?: string
          direccion?: string | null
          id?: string
          localidad?: string | null
          nombre?: string
          region?: string | null
          ruc?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
        }
        Relationships: []
      }
      contactos_cliente: {
        Row: {
          activo: boolean
          actualizado_en: string
          cargo: string | null
          cliente_id: string
          correo: string | null
          creado_en: string
          es_principal: boolean
          es_whatsapp: boolean
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          cargo?: string | null
          cliente_id: string
          correo?: string | null
          creado_en?: string
          es_principal?: boolean
          es_whatsapp?: boolean
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          cargo?: string | null
          cliente_id?: string
          correo?: string | null
          creado_en?: string
          es_principal?: boolean
          es_whatsapp?: boolean
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contactos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      dias_no_laborales: {
        Row: {
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          motivo: string | null
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          fecha: string
          id?: string
          motivo?: string | null
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          motivo?: string | null
        }
        Relationships: []
      }
      facturacion: {
        Row: {
          cantidad: number
          cliente_id: string | null
          cod_entidad: string | null
          cod_factura: string
          entidad_nombre: string
          fecha: string
          grupo: string | null
          grupo_fx: string | null
          id: string
          importado_en: string
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo: Database["public"]["Enums"]["tipo_facturacion"]
          total_venta: number
        }
        Insert: {
          cantidad?: number
          cliente_id?: string | null
          cod_entidad?: string | null
          cod_factura: string
          entidad_nombre: string
          fecha: string
          grupo?: string | null
          grupo_fx?: string | null
          id?: string
          importado_en?: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo: Database["public"]["Enums"]["tipo_facturacion"]
          total_venta?: number
        }
        Update: {
          cantidad?: number
          cliente_id?: string | null
          cod_entidad?: string | null
          cod_factura?: string
          entidad_nombre?: string
          fecha?: string
          grupo?: string | null
          grupo_fx?: string | null
          id?: string
          importado_en?: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo?: Database["public"]["Enums"]["tipo_facturacion"]
          total_venta?: number
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      facturacion_lineas_importadas: {
        Row: {
          actualizado_en: string
          cantidad: number | null
          cod_mercaderia: string | null
          codigo_fabricante: string | null
          codigo_interno_factura: string | null
          entidad_nombre: string
          factura: string | null
          fecha_factura: string | null
          grupo_normalizado: string | null
          id: string
          importacion_id: string | null
          importado_en: string
          linea_hash: string
          marca_normalizada: Database["public"]["Enums"]["marca"]
          mercaderia: string | null
          observacion: string | null
          origen_sistema: string
          raw_data: Json
          subgrupo_original: string | null
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo_facturacion:
            | Database["public"]["Enums"]["tipo_facturacion"]
            | null
          tipo_tiempo: string
          total_venta: number
          valor_unitario: number | null
        }
        Insert: {
          actualizado_en?: string
          cantidad?: number | null
          cod_mercaderia?: string | null
          codigo_fabricante?: string | null
          codigo_interno_factura?: string | null
          entidad_nombre: string
          factura?: string | null
          fecha_factura?: string | null
          grupo_normalizado?: string | null
          id?: string
          importacion_id?: string | null
          importado_en?: string
          linea_hash?: string
          marca_normalizada?: Database["public"]["Enums"]["marca"]
          mercaderia?: string | null
          observacion?: string | null
          origen_sistema?: string
          raw_data?: Json
          subgrupo_original?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo_facturacion?:
            | Database["public"]["Enums"]["tipo_facturacion"]
            | null
          tipo_tiempo?: string
          total_venta?: number
          valor_unitario?: number | null
        }
        Update: {
          actualizado_en?: string
          cantidad?: number | null
          cod_mercaderia?: string | null
          codigo_fabricante?: string | null
          codigo_interno_factura?: string | null
          entidad_nombre?: string
          factura?: string | null
          fecha_factura?: string | null
          grupo_normalizado?: string | null
          id?: string
          importacion_id?: string | null
          importado_en?: string
          linea_hash?: string
          marca_normalizada?: Database["public"]["Enums"]["marca"]
          mercaderia?: string | null
          observacion?: string | null
          origen_sistema?: string
          raw_data?: Json
          subgrupo_original?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo_facturacion?:
            | Database["public"]["Enums"]["tipo_facturacion"]
            | null
          tipo_tiempo?: string
          total_venta?: number
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_lineas_importadas_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      importaciones: {
        Row: {
          archivo_nombre: string | null
          creado_en: string
          duplicados: number
          id: string
          insertados: number
          metadata: Json
          origen_sistema: string | null
          tipo: Database["public"]["Enums"]["tipo_importacion"]
          total_filas: number
          usuario_id: string | null
        }
        Insert: {
          archivo_nombre?: string | null
          creado_en?: string
          duplicados?: number
          id?: string
          insertados?: number
          metadata?: Json
          origen_sistema?: string | null
          tipo: Database["public"]["Enums"]["tipo_importacion"]
          total_filas?: number
          usuario_id?: string | null
        }
        Update: {
          archivo_nombre?: string | null
          creado_en?: string
          duplicados?: number
          id?: string
          insertados?: number
          metadata?: Json
          origen_sistema?: string | null
          tipo?: Database["public"]["Enums"]["tipo_importacion"]
          total_filas?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          actividad_realizada: string | null
          actualizado_en: string
          creado_en: string
          creado_por: string | null
          estado_jornada: Database["public"]["Enums"]["estado_jornada"]
          evidencia_urls: string[]
          fecha_real: string
          hora_fin: string | null
          hora_inicio: string | null
          horas_reales: number | null
          id: string
          observaciones: string | null
          programacion_id: string | null
          resultado: string | null
          tecnico_id: string
          trabajo_id: string
        }
        Insert: {
          actividad_realizada?: string | null
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          estado_jornada?: Database["public"]["Enums"]["estado_jornada"]
          evidencia_urls?: string[]
          fecha_real: string
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_reales?: number | null
          id?: string
          observaciones?: string | null
          programacion_id?: string | null
          resultado?: string | null
          tecnico_id: string
          trabajo_id: string
        }
        Update: {
          actividad_realizada?: string | null
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          estado_jornada?: Database["public"]["Enums"]["estado_jornada"]
          evidencia_urls?: string[]
          fecha_real?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_reales?: number | null
          id?: string
          observaciones?: string | null
          programacion_id?: string | null
          resultado?: string | null
          tecnico_id?: string
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_programacion_id_fkey"
            columns: ["programacion_id"]
            isOneToOne: false
            referencedRelation: "programaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornadas_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornadas_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_horas"
            referencedColumns: ["trabajo_id"]
          },
        ]
      }
      ordenes_servicio_importadas: {
        Row: {
          actualizado_en: string
          cliente_nombre: string | null
          cod_interno: string | null
          cod_mecanico: string | null
          factura: string | null
          fecha_abierta_os: string | null
          fecha_cierre_os: string | null
          fecha_emision_factura: string | null
          importado_en: string
          kilometro_valor: number | null
          km_cantidad: number | null
          km_valor_unitario: number | null
          marca: string | null
          nro_chasis: string | null
          os_numero: string
          problema: string | null
          raw_data: Json
          repuesto_valor: number | null
          responsable: string | null
          servicios_cantidad: number | null
          servicios_valor: number | null
          servicios_valor_unitario: number | null
          situacion_facturacion: string | null
          situacion_os: string | null
          terceros_valor: number | null
          tipo_tiempo: string | null
          trabajo_id: string | null
        }
        Insert: {
          actualizado_en?: string
          cliente_nombre?: string | null
          cod_interno?: string | null
          cod_mecanico?: string | null
          factura?: string | null
          fecha_abierta_os?: string | null
          fecha_cierre_os?: string | null
          fecha_emision_factura?: string | null
          importado_en?: string
          kilometro_valor?: number | null
          km_cantidad?: number | null
          km_valor_unitario?: number | null
          marca?: string | null
          nro_chasis?: string | null
          os_numero: string
          problema?: string | null
          raw_data?: Json
          repuesto_valor?: number | null
          responsable?: string | null
          servicios_cantidad?: number | null
          servicios_valor?: number | null
          servicios_valor_unitario?: number | null
          situacion_facturacion?: string | null
          situacion_os?: string | null
          terceros_valor?: number | null
          tipo_tiempo?: string | null
          trabajo_id?: string | null
        }
        Update: {
          actualizado_en?: string
          cliente_nombre?: string | null
          cod_interno?: string | null
          cod_mecanico?: string | null
          factura?: string | null
          fecha_abierta_os?: string | null
          fecha_cierre_os?: string | null
          fecha_emision_factura?: string | null
          importado_en?: string
          kilometro_valor?: number | null
          km_cantidad?: number | null
          km_valor_unitario?: number | null
          marca?: string | null
          nro_chasis?: string | null
          os_numero?: string
          problema?: string | null
          raw_data?: Json
          repuesto_valor?: number | null
          responsable?: string | null
          servicios_cantidad?: number | null
          servicios_valor?: number | null
          servicios_valor_unitario?: number | null
          situacion_facturacion?: string | null
          situacion_os?: string | null
          terceros_valor?: number | null
          tipo_tiempo?: string | null
          trabajo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_servicio_importadas_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_importadas_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_horas"
            referencedColumns: ["trabajo_id"]
          },
        ]
      }
      parque_maquinas: {
        Row: {
          activo: boolean
          actualizado_en: string
          agregado_manualmente: boolean
          anio: number | null
          cliente_id: string | null
          creado_en: string
          id: string
          localidad: string | null
          marca: Database["public"]["Enums"]["marca"]
          modelo_tipo: string | null
          notas: string | null
          serie: string
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          vendedor: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          agregado_manualmente?: boolean
          anio?: number | null
          cliente_id?: string | null
          creado_en?: string
          id?: string
          localidad?: string | null
          marca: Database["public"]["Enums"]["marca"]
          modelo_tipo?: string | null
          notas?: string | null
          serie: string
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          vendedor?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          agregado_manualmente?: boolean
          anio?: number | null
          cliente_id?: string | null
          creado_en?: string
          id?: string
          localidad?: string | null
          marca?: Database["public"]["Enums"]["marca"]
          modelo_tipo?: string | null
          notas?: string | null
          serie?: string
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parque_maquinas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_maquinas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          actualizado_en: string
          auth_user_id: string | null
          creado_en: string
          id: string
          nombre: string
          sucursal: Database["public"]["Enums"]["sucursal"] | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          auth_user_id?: string | null
          creado_en?: string
          id: string
          nombre: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          auth_user_id?: string | null
          creado_en?: string
          id?: string
          nombre?: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
        }
        Relationships: []
      }
      programaciones: {
        Row: {
          accion_programada: string | null
          actualizado_en: string
          auxiliares: string[]
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_programacion"]
          fecha_programada: string
          horas_estimadas: number | null
          id: string
          motivo_reprogramacion: string | null
          observacion: string | null
          reemplaza_a: string | null
          tecnico_principal_id: string | null
          trabajo_id: string
        }
        Insert: {
          accion_programada?: string | null
          actualizado_en?: string
          auxiliares?: string[]
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_programacion"]
          fecha_programada: string
          horas_estimadas?: number | null
          id?: string
          motivo_reprogramacion?: string | null
          observacion?: string | null
          reemplaza_a?: string | null
          tecnico_principal_id?: string | null
          trabajo_id: string
        }
        Update: {
          accion_programada?: string | null
          actualizado_en?: string
          auxiliares?: string[]
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_programacion"]
          fecha_programada?: string
          horas_estimadas?: number | null
          id?: string
          motivo_reprogramacion?: string | null
          observacion?: string | null
          reemplaza_a?: string | null
          tecnico_principal_id?: string | null
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programaciones_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "programaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programaciones_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programaciones_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_horas"
            referencedColumns: ["trabajo_id"]
          },
        ]
      }
      seguimiento_comercial: {
        Row: {
          cliente_id: string
          creado_en: string
          fecha: string
          id: string
          observaciones: string | null
          resultado: Database["public"]["Enums"]["resultado_seguimiento"]
          usuario_id: string | null
        }
        Insert: {
          cliente_id: string
          creado_en?: string
          fecha?: string
          id?: string
          observaciones?: string | null
          resultado: Database["public"]["Enums"]["resultado_seguimiento"]
          usuario_id?: string | null
        }
        Update: {
          cliente_id?: string
          creado_en?: string
          fecha?: string
          id?: string
          observaciones?: string | null
          resultado?: Database["public"]["Enums"]["resultado_seguimiento"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seguimiento_comercial_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_comercial_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_comercial_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      servicio_jornadas: {
        Row: {
          actualizado_en: string
          auxiliares: string[]
          creado_en: string
          estado: Database["public"]["Enums"]["estado_servicio"]
          fecha: string
          horas_trabajadas: number | null
          id: string
          observaciones: string | null
          servicio_id: string
          tecnico_responsable_id: string | null
        }
        Insert: {
          actualizado_en?: string
          auxiliares?: string[]
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_servicio"]
          fecha: string
          horas_trabajadas?: number | null
          id?: string
          observaciones?: string | null
          servicio_id: string
          tecnico_responsable_id?: string | null
        }
        Update: {
          actualizado_en?: string
          auxiliares?: string[]
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_servicio"]
          fecha?: string
          horas_trabajadas?: number | null
          id?: string
          observaciones?: string | null
          servicio_id?: string
          tecnico_responsable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicio_jornadas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicio_jornadas_tecnico_responsable_id_fkey"
            columns: ["tecnico_responsable_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          actualizado_en: string
          auxiliares: string[]
          cliente_id: string | null
          creado_en: string
          creado_por: string | null
          dia_semana: string
          estado: Database["public"]["Enums"]["estado_servicio"]
          fecha_programada: string
          horas_trabajadas: number | null
          id: string
          marca: Database["public"]["Enums"]["marca"]
          observaciones: string | null
          semana: number
          sucursal: Database["public"]["Enums"]["sucursal"]
          tecnico_responsable_id: string | null
          tipo_trabajo: Database["public"]["Enums"]["tipo_trabajo"]
          trabajo_descripcion: string
          visto_por: string[]
        }
        Insert: {
          actualizado_en?: string
          auxiliares?: string[]
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string | null
          dia_semana: string
          estado?: Database["public"]["Enums"]["estado_servicio"]
          fecha_programada: string
          horas_trabajadas?: number | null
          id?: string
          marca: Database["public"]["Enums"]["marca"]
          observaciones?: string | null
          semana: number
          sucursal: Database["public"]["Enums"]["sucursal"]
          tecnico_responsable_id?: string | null
          tipo_trabajo?: Database["public"]["Enums"]["tipo_trabajo"]
          trabajo_descripcion: string
          visto_por?: string[]
        }
        Update: {
          actualizado_en?: string
          auxiliares?: string[]
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string | null
          dia_semana?: string
          estado?: Database["public"]["Enums"]["estado_servicio"]
          fecha_programada?: string
          horas_trabajadas?: number | null
          id?: string
          marca?: Database["public"]["Enums"]["marca"]
          observaciones?: string | null
          semana?: number
          sucursal?: Database["public"]["Enums"]["sucursal"]
          tecnico_responsable_id?: string | null
          tipo_trabajo?: Database["public"]["Enums"]["tipo_trabajo"]
          trabajo_descripcion?: string
          visto_por?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "servicios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_tecnico_responsable_id_fkey"
            columns: ["tecnico_responsable_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tecnico_disponibilidad: {
        Row: {
          actualizado_en: string
          bloquea_agenda: boolean
          creado_en: string
          creado_por: string | null
          fecha_fin: string
          fecha_inicio: string
          id: string
          observacion: string | null
          tecnico_id: string
          tipo: string
        }
        Insert: {
          actualizado_en?: string
          bloquea_agenda?: boolean
          creado_en?: string
          creado_por?: string | null
          fecha_fin: string
          fecha_inicio: string
          id?: string
          observacion?: string | null
          tecnico_id: string
          tipo?: string
        }
        Update: {
          actualizado_en?: string
          bloquea_agenda?: boolean
          creado_en?: string
          creado_por?: string | null
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          observacion?: string | null
          tecnico_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tecnico_disponibilidad_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tecnico_disponibilidad_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_historial: {
        Row: {
          creado_en: string
          id: string
          payload: Json
          tipo_evento: Database["public"]["Enums"]["tipo_evento_historial"]
          trabajo_id: string
          usuario_id: string | null
        }
        Insert: {
          creado_en?: string
          id?: string
          payload?: Json
          tipo_evento: Database["public"]["Enums"]["tipo_evento_historial"]
          trabajo_id: string
          usuario_id?: string | null
        }
        Update: {
          creado_en?: string
          id?: string
          payload?: Json
          tipo_evento?: Database["public"]["Enums"]["tipo_evento_historial"]
          trabajo_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_historial_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_historial_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_horas"
            referencedColumns: ["trabajo_id"]
          },
        ]
      }
      trabajos: {
        Row: {
          actualizado_en: string
          cerrado_en: string | null
          cerrado_por: string | null
          cliente_id: string | null
          codigo: string | null
          creado_en: string
          creado_por: string | null
          descripcion_problema: string
          estado_general: Database["public"]["Enums"]["estado_trabajo"]
          fecha_compromiso: string | null
          id: string
          legacy_servicio_id: string | null
          maquina_id: string | null
          marca: Database["public"]["Enums"]["marca"]
          motivo_bloqueo: string | null
          numero: number
          os_numero: string | null
          prioridad: Database["public"]["Enums"]["prioridad_trabajo"]
          proxima_accion: string | null
          responsable_principal_id: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_trabajo: Database["public"]["Enums"]["tipo_trabajo"]
        }
        Insert: {
          actualizado_en?: string
          cerrado_en?: string | null
          cerrado_por?: string | null
          cliente_id?: string | null
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          descripcion_problema: string
          estado_general?: Database["public"]["Enums"]["estado_trabajo"]
          fecha_compromiso?: string | null
          id?: string
          legacy_servicio_id?: string | null
          maquina_id?: string | null
          marca: Database["public"]["Enums"]["marca"]
          motivo_bloqueo?: string | null
          numero?: number
          os_numero?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_trabajo"]
          proxima_accion?: string | null
          responsable_principal_id?: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_trabajo?: Database["public"]["Enums"]["tipo_trabajo"]
        }
        Update: {
          actualizado_en?: string
          cerrado_en?: string | null
          cerrado_por?: string | null
          cliente_id?: string | null
          codigo?: string | null
          creado_en?: string
          creado_por?: string | null
          descripcion_problema?: string
          estado_general?: Database["public"]["Enums"]["estado_trabajo"]
          fecha_compromiso?: string | null
          id?: string
          legacy_servicio_id?: string | null
          maquina_id?: string | null
          marca?: Database["public"]["Enums"]["marca"]
          motivo_bloqueo?: string | null
          numero?: number
          os_numero?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_trabajo"]
          proxima_accion?: string | null
          responsable_principal_id?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"]
          tipo_trabajo?: Database["public"]["Enums"]["tipo_trabajo"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          creado_en: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          creado_en?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          creado_en?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      trabajos_horas: {
        Row: {
          horas_reales_total: number | null
          jornadas_count: number | null
          trabajo_id: string | null
        }
        Relationships: []
      }
      v_clientes_resumen: {
        Row: {
          antiguedad: number | null
          fact_total: number | null
          id: string | null
          maquinas: number | null
          nombre: string | null
          ult_rep: string | null
          ult_serv: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      facturacion_tipo_tiempo_campos: {
        Args: { p_entidad: string; p_observacion: string }
        Returns: string
      }
      get_user_sucursal: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["sucursal"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      parque_kpis: {
        Args: never
        Returns: {
          con_servicio_anio: number
          contactados_mes: number
          sin_contacto_60d: number
          total_clientes: number
          total_maquinas: number
        }[]
      }
      parque_resumen_facturacion: {
        Args: {
          p_desde: string
          p_hasta: string
          p_prev_desde: string
          p_prev_hasta: string
        }
        Returns: {
          cliente_id: string
          fact_actual: number
          fact_prev: number
          tiene_rep_rango: boolean
          tiene_srv_rango: boolean
        }[]
      }
      parque_ultimas_facturas: {
        Args: never
        Returns: {
          cliente_id: string
          ult_repuesto: string
          ult_servicio: string
        }[]
      }
      programar_jornada: {
        Args: {
          p_auxiliares: string[]
          p_fecha: string
          p_observacion: string
          p_tecnico_id: string
          p_trabajo_id: string
        }
        Returns: string
      }
      recalcular_estado_trabajo: {
        Args: { p_trabajo_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "cabecilla" | "tecnico"
      estado_jornada: "en_curso" | "completada" | "incompleta"
      estado_programacion:
        | "programada"
        | "cumplida"
        | "reprogramada"
        | "cancelada"
      estado_servicio: "Pendiente" | "Iniciado" | "Completado" | "Cancelada"
      estado_trabajo:
        | "nuevo"
        | "pendiente_diagnostico"
        | "pendiente_programar"
        | "programado"
        | "en_ejecucion"
        | "bloqueado"
        | "terminado_pendiente_validar"
        | "cerrado"
        | "pendiente"
        | "iniciado"
        | "en_pausa"
        | "completado"
      marca: "CLAAS" | "HORSCH" | "OTROS"
      prioridad_trabajo: "baja" | "media" | "alta" | "urgente"
      resultado_seguimiento:
        | "Contactado"
        | "No contesta"
        | "Rechazó"
        | "Agendó servicio"
        | "Pendiente llamar"
      subgrupo_maquina:
        | "COSECHADORAS"
        | "SEMBRADORAS"
        | "PICADORAS"
        | "PLATAFORMAS"
        | "PULVERIZADORAS"
        | "TRACTORES"
        | "OTRO"
        | "PLATAFORMAS/CABEZALES"
        | "SUELO"
      sucursal:
        | "Santa Rita"
        | "Santa Rosa"
        | "Campo 9"
        | "Misiones"
        | "Loma Plata"
        | "Katuete"
      tipo_evento_historial:
        | "creacion"
        | "cambio_estado"
        | "cambio_responsable"
        | "programacion_creada"
        | "programacion_actualizada"
        | "reprogramacion"
        | "jornada_creada"
        | "jornada_actualizada"
        | "cierre"
        | "observacion"
      tipo_facturacion: "Repuesto" | "Servicio"
      tipo_importacion: "parque" | "facturacion"
      tipo_trabajo: "Visita de campo" | "Máquina en taller"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "cabecilla", "tecnico"],
      estado_jornada: ["en_curso", "completada", "incompleta"],
      estado_programacion: [
        "programada",
        "cumplida",
        "reprogramada",
        "cancelada",
      ],
      estado_servicio: ["Pendiente", "Iniciado", "Completado", "Cancelada"],
      estado_trabajo: [
        "nuevo",
        "pendiente_diagnostico",
        "pendiente_programar",
        "programado",
        "en_ejecucion",
        "bloqueado",
        "terminado_pendiente_validar",
        "cerrado",
        "pendiente",
        "iniciado",
        "en_pausa",
        "completado",
      ],
      marca: ["CLAAS", "HORSCH", "OTROS"],
      prioridad_trabajo: ["baja", "media", "alta", "urgente"],
      resultado_seguimiento: [
        "Contactado",
        "No contesta",
        "Rechazó",
        "Agendó servicio",
        "Pendiente llamar",
      ],
      subgrupo_maquina: [
        "COSECHADORAS",
        "SEMBRADORAS",
        "PICADORAS",
        "PLATAFORMAS",
        "PULVERIZADORAS",
        "TRACTORES",
        "OTRO",
        "PLATAFORMAS/CABEZALES",
        "SUELO",
      ],
      sucursal: [
        "Santa Rita",
        "Santa Rosa",
        "Campo 9",
        "Misiones",
        "Loma Plata",
        "Katuete",
      ],
      tipo_evento_historial: [
        "creacion",
        "cambio_estado",
        "cambio_responsable",
        "programacion_creada",
        "programacion_actualizada",
        "reprogramacion",
        "jornada_creada",
        "jornada_actualizada",
        "cierre",
        "observacion",
      ],
      tipo_facturacion: ["Repuesto", "Servicio"],
      tipo_importacion: ["parque", "facturacion"],
      tipo_trabajo: ["Visita de campo", "Máquina en taller"],
    },
  },
} as const
