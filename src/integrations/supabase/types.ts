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
    PostgrestVersion: "14.17"
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
          telefono: string | null
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
          telefono?: string | null
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
          telefono?: string | null
        }
        Relationships: []
      }
      comisiones_jornadas: {
        Row: {
          actualizado_en: string
          cliente_nombre: string | null
          creado_en: string
          estado_os: string | null
          estado_validacion: string
          fecha_cierre: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          fuente_clave: string
          hora_fin: string | null
          hora_inicio: string | null
          horas_calculadas: number | null
          horas_reportadas: number | null
          horas_validas: number | null
          id: string
          importacion_id: string | null
          motivos_validacion: string[]
          nro_chasis: string | null
          origen_sistema: string
          os_numero: string
          raw_data: Json
          rol_tecnico: string
          sucursal: string | null
          tecnico_codigo: string | null
          tecnico_nombre: string
          tecnico_profile_id: string | null
          tipo_tiempo: string
          tipo_tiempo_ajustado: boolean
          tipo_tiempo_ajustado_en: string | null
          tipo_tiempo_ajustado_por: string | null
          tipo_tiempo_importado: string
          validado_en: string | null
          validado_por: string | null
          vigente: boolean
        }
        Insert: {
          actualizado_en?: string
          cliente_nombre?: string | null
          creado_en?: string
          estado_os?: string | null
          estado_validacion?: string
          fecha_cierre?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fuente_clave: string
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_calculadas?: number | null
          horas_reportadas?: number | null
          horas_validas?: number | null
          id?: string
          importacion_id?: string | null
          motivos_validacion?: string[]
          nro_chasis?: string | null
          origen_sistema?: string
          os_numero: string
          raw_data?: Json
          rol_tecnico?: string
          sucursal?: string | null
          tecnico_codigo?: string | null
          tecnico_nombre: string
          tecnico_profile_id?: string | null
          tipo_tiempo?: string
          tipo_tiempo_ajustado?: boolean
          tipo_tiempo_ajustado_en?: string | null
          tipo_tiempo_ajustado_por?: string | null
          tipo_tiempo_importado?: string
          validado_en?: string | null
          validado_por?: string | null
          vigente?: boolean
        }
        Update: {
          actualizado_en?: string
          cliente_nombre?: string | null
          creado_en?: string
          estado_os?: string | null
          estado_validacion?: string
          fecha_cierre?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fuente_clave?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_calculadas?: number | null
          horas_reportadas?: number | null
          horas_validas?: number | null
          id?: string
          importacion_id?: string | null
          motivos_validacion?: string[]
          nro_chasis?: string | null
          origen_sistema?: string
          os_numero?: string
          raw_data?: Json
          rol_tecnico?: string
          sucursal?: string | null
          tecnico_codigo?: string | null
          tecnico_nombre?: string
          tecnico_profile_id?: string | null
          tipo_tiempo?: string
          tipo_tiempo_ajustado?: boolean
          tipo_tiempo_ajustado_en?: string | null
          tipo_tiempo_ajustado_por?: string | null
          tipo_tiempo_importado?: string
          validado_en?: string | null
          validado_por?: string | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_jornadas_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_jornadas_tecnico_profile_id_fkey"
            columns: ["tecnico_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comisiones_liquidacion_detalle: {
        Row: {
          creado_en: string
          horas_pagadas: number
          id: string
          jornada_id: string
          liquidacion_id: string
        }
        Insert: {
          creado_en?: string
          horas_pagadas: number
          id?: string
          jornada_id: string
          liquidacion_id: string
        }
        Update: {
          creado_en?: string
          horas_pagadas?: number
          id?: string
          jornada_id?: string
          liquidacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_liquidacion_detalle_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: true
            referencedRelation: "comisiones_jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_liquidacion_detalle_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "comisiones_liquidaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      comisiones_liquidaciones: {
        Row: {
          creado_en: string
          creado_por: string
          estado: string
          id: string
          observacion: string | null
          pagado_en: string | null
          periodo_desde: string
          periodo_hasta: string
          total_horas: number
        }
        Insert: {
          creado_en?: string
          creado_por?: string
          estado?: string
          id?: string
          observacion?: string | null
          pagado_en?: string | null
          periodo_desde: string
          periodo_hasta: string
          total_horas?: number
        }
        Update: {
          creado_en?: string
          creado_por?: string
          estado?: string
          id?: string
          observacion?: string | null
          pagado_en?: string | null
          periodo_desde?: string
          periodo_hasta?: string
          total_horas?: number
        }
        Relationships: []
      }
      comisiones_tipo_tiempo_ajustes: {
        Row: {
          actualizado_en: string
          ajustado_en: string
          ajustado_por: string | null
          ajuste_clave: string
          fecha_fin: string | null
          fecha_inicio: string | null
          hora_fin: string | null
          hora_inicio: string | null
          os_numero: string
          tecnico_codigo: string | null
          tecnico_nombre: string
          tecnico_profile_id: string | null
          tipo_tiempo: string
          valor_importado_al_ajustar: string
        }
        Insert: {
          actualizado_en?: string
          ajustado_en?: string
          ajustado_por?: string | null
          ajuste_clave: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          os_numero: string
          tecnico_codigo?: string | null
          tecnico_nombre: string
          tecnico_profile_id?: string | null
          tipo_tiempo: string
          valor_importado_al_ajustar: string
        }
        Update: {
          actualizado_en?: string
          ajustado_en?: string
          ajustado_por?: string | null
          ajuste_clave?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          os_numero?: string
          tecnico_codigo?: string | null
          tecnico_nombre?: string
          tecnico_profile_id?: string | null
          tipo_tiempo?: string
          valor_importado_al_ajustar?: string
        }
        Relationships: []
      }
      comisiones_tipo_tiempo_validaciones_os: {
        Row: {
          actualizado_en: string
          creado_en: string
          fuente: string
          os_numero: string
          periodo_desde: string | null
          periodo_hasta: string | null
          tipo_tiempo: string
          validado_en: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          fuente: string
          os_numero: string
          periodo_desde?: string | null
          periodo_hasta?: string | null
          tipo_tiempo: string
          validado_en: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          fuente?: string
          os_numero?: string
          periodo_desde?: string | null
          periodo_hasta?: string | null
          tipo_tiempo?: string
          validado_en?: string
        }
        Relationships: []
      }
      compras_pedidos: {
        Row: {
          cantidad: number | null
          cantidad_entregada: number | null
          cantidad_pendiente: number | null
          condicion_pago: string | null
          descripcion: string | null
          fecha_emision: string | null
          importado_en: string
          item: string
          moneda: string | null
          naturaleza: string | null
          nro_pedido: string
          precio_unitario: number | null
          producto_codigo: string | null
          proveedor_codigo: string | null
          proveedor_nombre: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_entrega: string | null
          unidad: string | null
          valor_total: number | null
        }
        Insert: {
          cantidad?: number | null
          cantidad_entregada?: number | null
          cantidad_pendiente?: number | null
          condicion_pago?: string | null
          descripcion?: string | null
          fecha_emision?: string | null
          importado_en?: string
          item: string
          moneda?: string | null
          naturaleza?: string | null
          nro_pedido: string
          precio_unitario?: number | null
          producto_codigo?: string | null
          proveedor_codigo?: string | null
          proveedor_nombre?: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_entrega?: string | null
          unidad?: string | null
          valor_total?: number | null
        }
        Update: {
          cantidad?: number | null
          cantidad_entregada?: number | null
          cantidad_pendiente?: number | null
          condicion_pago?: string | null
          descripcion?: string | null
          fecha_emision?: string | null
          importado_en?: string
          item?: string
          moneda?: string | null
          naturaleza?: string | null
          nro_pedido?: string
          precio_unitario?: number | null
          producto_codigo?: string | null
          proveedor_codigo?: string | null
          proveedor_nombre?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"]
          tipo_entrega?: string | null
          unidad?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      compras_solicitud_pedido_vinculo: {
        Row: {
          item: string
          nro_solicitud: string
          pedido_nro_pedido: string
          pedido_sucursal: Database["public"]["Enums"]["sucursal"]
          sucursal: Database["public"]["Enums"]["sucursal"]
          vinculado_en: string
          vinculado_por: string | null
        }
        Insert: {
          item: string
          nro_solicitud: string
          pedido_nro_pedido: string
          pedido_sucursal: Database["public"]["Enums"]["sucursal"]
          sucursal: Database["public"]["Enums"]["sucursal"]
          vinculado_en?: string
          vinculado_por?: string | null
        }
        Update: {
          item?: string
          nro_solicitud?: string
          pedido_nro_pedido?: string
          pedido_sucursal?: Database["public"]["Enums"]["sucursal"]
          sucursal?: Database["public"]["Enums"]["sucursal"]
          vinculado_en?: string
          vinculado_por?: string | null
        }
        Relationships: []
      }
      compras_solicitudes: {
        Row: {
          cantidad: number | null
          codigo_fabricante: string | null
          descripcion: string | null
          fecha_emision: string | null
          importado_en: string
          item: string
          marca_solicitada: string | null
          moneda: string | null
          nro_solicitud: string
          observacion: string | null
          precio_unitario: number | null
          producto_codigo: string | null
          solicitante: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
          unidad: string | null
          valor_total: number | null
        }
        Insert: {
          cantidad?: number | null
          codigo_fabricante?: string | null
          descripcion?: string | null
          fecha_emision?: string | null
          importado_en?: string
          item: string
          marca_solicitada?: string | null
          moneda?: string | null
          nro_solicitud: string
          observacion?: string | null
          precio_unitario?: number | null
          producto_codigo?: string | null
          solicitante?: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
          unidad?: string | null
          valor_total?: number | null
        }
        Update: {
          cantidad?: number | null
          codigo_fabricante?: string | null
          descripcion?: string | null
          fecha_emision?: string | null
          importado_en?: string
          item?: string
          marca_solicitada?: string | null
          moneda?: string | null
          nro_solicitud?: string
          observacion?: string | null
          precio_unitario?: number | null
          producto_codigo?: string | null
          solicitante?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"]
          unidad?: string | null
          valor_total?: number | null
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
          excluido_de_reportes: boolean
          fecha: string
          grupo: string | null
          grupo_fx: string | null
          id: string
          importado_en: string
          moneda: string | null
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
          excluido_de_reportes?: boolean
          fecha: string
          grupo?: string | null
          grupo_fx?: string | null
          id?: string
          importado_en?: string
          moneda?: string | null
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
          excluido_de_reportes?: boolean
          fecha?: string
          grupo?: string | null
          grupo_fx?: string | null
          id?: string
          importado_en?: string
          moneda?: string | null
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
          cliente_id: string | null
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
          moneda: string | null
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
          cliente_id?: string | null
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
          moneda?: string | null
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
          cliente_id?: string | null
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
          moneda?: string | null
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
            foreignKeyName: "facturacion_lineas_importadas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_lineas_importadas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
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
      maquinaria_documentos: {
        Row: {
          actualizado_en: string
          archivo_nombre: string
          confianza: Json
          creado_en: string
          datos_extraidos: Json
          error_extraccion: string | null
          estado_extraccion: string
          id: string
          importacion_id: string | null
          mime_type: string | null
          operacion_id: string
          revisado_en: string | null
          revisado_por: string | null
          storage_path: string
          subido_por: string | null
          tamano_bytes: number | null
          tipo: string
        }
        Insert: {
          actualizado_en?: string
          archivo_nombre: string
          confianza?: Json
          creado_en?: string
          datos_extraidos?: Json
          error_extraccion?: string | null
          estado_extraccion?: string
          id?: string
          importacion_id?: string | null
          mime_type?: string | null
          operacion_id: string
          revisado_en?: string | null
          revisado_por?: string | null
          storage_path: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tipo: string
        }
        Update: {
          actualizado_en?: string
          archivo_nombre?: string
          confianza?: Json
          creado_en?: string
          datos_extraidos?: Json
          error_extraccion?: string | null
          estado_extraccion?: string
          id?: string
          importacion_id?: string | null
          mime_type?: string | null
          operacion_id?: string
          revisado_en?: string | null
          revisado_por?: string | null
          storage_path?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_documentos_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importaciones_operativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
        ]
      }
      maquinaria_importacion_lineas: {
        Row: {
          actualizado_en: string
          ata: string | null
          cantidad: number | null
          chasis: string | null
          costo_final: number | null
          costo_final_sin_iva: number | null
          creado_en: string
          datos_fuente: Json
          descuento_especial: number | null
          descuentos: number | null
          destino: string | null
          diferencia: number | null
          estado_fuente: string | null
          eta: string | null
          factura_venta: string | null
          flete_seguro: number | null
          id: string
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          margen_porcentaje: number | null
          modelo: string | null
          notas: string | null
          np_numero: string | null
          oc: string | null
          operacion_id: string | null
          origen: string | null
          po: string | null
          precio_oc: number | null
          precio_teorico_oc: number | null
          prioridad: string | null
          producto: string | null
          producto_facturado: string | null
          proveedor: string | null
          proveedor_flete: string | null
          situacion_vinculo: string
          source_id: string
          source_row: number | null
          source_sheet: string
          tipo_cambio: number | null
          transporte: string | null
          unidad_id: string | null
          utilidad: number | null
          valor_venta: number | null
          venta_facturada: string | null
        }
        Insert: {
          actualizado_en?: string
          ata?: string | null
          cantidad?: number | null
          chasis?: string | null
          costo_final?: number | null
          costo_final_sin_iva?: number | null
          creado_en?: string
          datos_fuente?: Json
          descuento_especial?: number | null
          descuentos?: number | null
          destino?: string | null
          diferencia?: number | null
          estado_fuente?: string | null
          eta?: string | null
          factura_venta?: string | null
          flete_seguro?: number | null
          id?: string
          invoice_supplier?: string | null
          linea_id?: string | null
          llave_interna?: string | null
          margen_porcentaje?: number | null
          modelo?: string | null
          notas?: string | null
          np_numero?: string | null
          oc?: string | null
          operacion_id?: string | null
          origen?: string | null
          po?: string | null
          precio_oc?: number | null
          precio_teorico_oc?: number | null
          prioridad?: string | null
          producto?: string | null
          producto_facturado?: string | null
          proveedor?: string | null
          proveedor_flete?: string | null
          situacion_vinculo?: string
          source_id: string
          source_row?: number | null
          source_sheet?: string
          tipo_cambio?: number | null
          transporte?: string | null
          unidad_id?: string | null
          utilidad?: number | null
          valor_venta?: number | null
          venta_facturada?: string | null
        }
        Update: {
          actualizado_en?: string
          ata?: string | null
          cantidad?: number | null
          chasis?: string | null
          costo_final?: number | null
          costo_final_sin_iva?: number | null
          creado_en?: string
          datos_fuente?: Json
          descuento_especial?: number | null
          descuentos?: number | null
          destino?: string | null
          diferencia?: number | null
          estado_fuente?: string | null
          eta?: string | null
          factura_venta?: string | null
          flete_seguro?: number | null
          id?: string
          invoice_supplier?: string | null
          linea_id?: string | null
          llave_interna?: string | null
          margen_porcentaje?: number | null
          modelo?: string | null
          notas?: string | null
          np_numero?: string | null
          oc?: string | null
          operacion_id?: string | null
          origen?: string | null
          po?: string | null
          precio_oc?: number | null
          precio_teorico_oc?: number | null
          prioridad?: string | null
          producto?: string | null
          producto_facturado?: string | null
          proveedor?: string | null
          proveedor_flete?: string | null
          situacion_vinculo?: string
          source_id?: string
          source_row?: number | null
          source_sheet?: string
          tipo_cambio?: number | null
          transporte?: string | null
          unidad_id?: string | null
          utilidad?: number | null
          valor_venta?: number | null
          venta_facturada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_importacion_status_fuente: {
        Row: {
          actualizado_en: string
          completado: number | null
          datos_fuente: Json
          modelo: string | null
          planificado: number | null
          producto: string | null
          proveedor: string | null
          source_row: number
          source_sheet: string
          total: number | null
        }
        Insert: {
          actualizado_en?: string
          completado?: number | null
          datos_fuente?: Json
          modelo?: string | null
          planificado?: number | null
          producto?: string | null
          proveedor?: string | null
          source_row: number
          source_sheet?: string
          total?: number | null
        }
        Update: {
          actualizado_en?: string
          completado?: number | null
          datos_fuente?: Json
          modelo?: string | null
          planificado?: number | null
          producto?: string | null
          proveedor?: string | null
          source_row?: number
          source_sheet?: string
          total?: number | null
        }
        Relationships: []
      }
      maquinaria_importaciones_operativas: {
        Row: {
          actualizado_en: string
          creado_en: string
          estado: string
          factura_fecha: string | null
          factura_numero: string | null
          id: string
          moneda: string | null
          operacion_id: string
          proveedor: string | null
          valor_facturado: number | null
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          estado?: string
          factura_fecha?: string | null
          factura_numero?: string | null
          id?: string
          moneda?: string | null
          operacion_id: string
          proveedor?: string | null
          valor_facturado?: number | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          estado?: string
          factura_fecha?: string | null
          factura_numero?: string | null
          id?: string
          moneda?: string | null
          operacion_id?: string
          proveedor?: string | null
          valor_facturado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importaciones_operativas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importaciones_operativas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importaciones_operativas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importaciones_operativas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
        ]
      }
      maquinaria_marcas_admitidas: {
        Row: {
          activa: boolean
          actualizado_en: string
          actualizado_por: string | null
          admitida_parque: boolean
          marca: Database["public"]["Enums"]["marca"]
          observaciones: string | null
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          admitida_parque?: boolean
          marca: Database["public"]["Enums"]["marca"]
          observaciones?: string | null
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          actualizado_por?: string | null
          admitida_parque?: boolean
          marca?: Database["public"]["Enums"]["marca"]
          observaciones?: string | null
        }
        Relationships: []
      }
      maquinaria_operacion_lineas: {
        Row: {
          abastecimiento: string
          actualizado_en: string
          cantidad: number
          condicion: string
          confianza_extraccion: Json
          creado_en: string
          datos_extraidos: Json
          elegible_parque: boolean
          id: string
          linea_numero: number
          marca: Database["public"]["Enums"]["marca"]
          modelo: string | null
          operacion_id: string
          producto: string | null
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Insert: {
          abastecimiento?: string
          actualizado_en?: string
          cantidad?: number
          condicion?: string
          confianza_extraccion?: Json
          creado_en?: string
          datos_extraidos?: Json
          elegible_parque?: boolean
          id?: string
          linea_numero?: number
          marca?: Database["public"]["Enums"]["marca"]
          modelo?: string | null
          operacion_id: string
          producto?: string | null
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Update: {
          abastecimiento?: string
          actualizado_en?: string
          cantidad?: number
          condicion?: string
          confianza_extraccion?: Json
          creado_en?: string
          datos_extraidos?: Json
          elegible_parque?: boolean
          id?: string
          linea_numero?: number
          marca?: Database["public"]["Enums"]["marca"]
          modelo?: string | null
          operacion_id?: string
          producto?: string | null
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_operacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_operacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_operacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_operacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
        ]
      }
      maquinaria_operaciones: {
        Row: {
          actualizado_en: string
          cliente_id: string | null
          cliente_nombre: string | null
          comercial: string | null
          creado_en: string
          creado_por: string | null
          estado: string
          id: string
          np_fecha: string | null
          np_numero: string | null
          observaciones: string | null
          validado_en: string | null
          validado_por: string | null
        }
        Insert: {
          actualizado_en?: string
          cliente_id?: string | null
          cliente_nombre?: string | null
          comercial?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          id?: string
          np_fecha?: string | null
          np_numero?: string | null
          observaciones?: string | null
          validado_en?: string | null
          validado_por?: string | null
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string | null
          cliente_nombre?: string | null
          comercial?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          id?: string
          np_fecha?: string | null
          np_numero?: string | null
          observaciones?: string | null
          validado_en?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_operaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_operaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_unidades_operacion: {
        Row: {
          actualizado_en: string
          chasis: string | null
          creado_en: string
          estado: string
          id: string
          linea_id: string
          moneda: string | null
          numero_unidad: number
          parque_maquina_id: string | null
          valor_facturado: number | null
        }
        Insert: {
          actualizado_en?: string
          chasis?: string | null
          creado_en?: string
          estado?: string
          id?: string
          linea_id: string
          moneda?: string | null
          numero_unidad?: number
          parque_maquina_id?: string | null
          valor_facturado?: number | null
        }
        Update: {
          actualizado_en?: string
          chasis?: string | null
          creado_en?: string
          estado?: string
          id?: string
          linea_id?: string
          moneda?: string | null
          numero_unidad?: number
          parque_maquina_id?: string | null
          valor_facturado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_unidades_operacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_unidades_operacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_unidades_operacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_unidades_operacion_parque_maquina_id_fkey"
            columns: ["parque_maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["parque_maquina_id"]
          },
          {
            foreignKeyName: "maquinaria_unidades_operacion_parque_maquina_id_fkey"
            columns: ["parque_maquina_id"]
            isOneToOne: false
            referencedRelation: "parque_maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          activo: boolean
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          id: string
          nombre: string
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          accionada_en: string | null
          accionada_por: string | null
          actualizado_en: string
          clave_unica: string
          creado_en: string
          datos: Json
          destinatario_roles: Database["public"]["Enums"]["app_role"][]
          estado: string
          id: string
          mensaje: string | null
          tipo: string
          titulo: string
          visto_por: string[]
        }
        Insert: {
          accionada_en?: string | null
          accionada_por?: string | null
          actualizado_en?: string
          clave_unica: string
          creado_en?: string
          datos?: Json
          destinatario_roles?: Database["public"]["Enums"]["app_role"][]
          estado?: string
          id?: string
          mensaje?: string | null
          tipo: string
          titulo: string
          visto_por?: string[]
        }
        Update: {
          accionada_en?: string | null
          accionada_por?: string | null
          actualizado_en?: string
          clave_unica?: string
          creado_en?: string
          datos?: Json
          destinatario_roles?: Database["public"]["Enums"]["app_role"][]
          estado?: string
          id?: string
          mensaje?: string | null
          tipo?: string
          titulo?: string
          visto_por?: string[]
        }
        Relationships: []
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
      parque_factura_os_cliente: {
        Row: {
          cliente_id: string
          factura_clave: string
          marca: string | null
        }
        Insert: {
          cliente_id: string
          factura_clave: string
          marca?: string | null
        }
        Update: {
          cliente_id?: string
          factura_clave?: string
          marca?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parque_factura_os_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_factura_os_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      parque_historial_propiedad: {
        Row: {
          cliente_anterior_id: string | null
          cliente_nuevo_id: string | null
          id: string
          maquina_id: string
          observaciones: string | null
          operacion_id: string | null
          registrado_en: string
          registrado_por: string | null
          tipo_evento: string
        }
        Insert: {
          cliente_anterior_id?: string | null
          cliente_nuevo_id?: string | null
          id?: string
          maquina_id: string
          observaciones?: string | null
          operacion_id?: string | null
          registrado_en?: string
          registrado_por?: string | null
          tipo_evento: string
        }
        Update: {
          cliente_anterior_id?: string | null
          cliente_nuevo_id?: string | null
          id?: string
          maquina_id?: string
          observaciones?: string | null
          operacion_id?: string | null
          registrado_en?: string
          registrado_por?: string | null
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "parque_historial_propiedad_cliente_anterior_id_fkey"
            columns: ["cliente_anterior_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_cliente_anterior_id_fkey"
            columns: ["cliente_anterior_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_cliente_nuevo_id_fkey"
            columns: ["cliente_nuevo_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_cliente_nuevo_id_fkey"
            columns: ["cliente_nuevo_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["parque_maquina_id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "parque_maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "parque_historial_propiedad_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
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
      parque_modelos_alias: {
        Row: {
          alias: string
          clave_alias: string
          creado_en: string
          id: string
          marca: Database["public"]["Enums"]["marca"]
          modelo_catalogo_id: string
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Insert: {
          alias: string
          clave_alias: string
          creado_en?: string
          id?: string
          marca: Database["public"]["Enums"]["marca"]
          modelo_catalogo_id: string
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Update: {
          alias?: string
          clave_alias?: string
          creado_en?: string
          id?: string
          marca?: Database["public"]["Enums"]["marca"]
          modelo_catalogo_id?: string
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Relationships: [
          {
            foreignKeyName: "parque_modelos_alias_modelo_catalogo_id_fkey"
            columns: ["modelo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "parque_modelos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      parque_modelos_catalogo: {
        Row: {
          activo: boolean
          actualizado_en: string
          clave_normalizada: string
          creado_en: string
          id: string
          marca: Database["public"]["Enums"]["marca"]
          nombre: string
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          clave_normalizada: string
          creado_en?: string
          id?: string
          marca: Database["public"]["Enums"]["marca"]
          nombre: string
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          clave_normalizada?: string
          creado_en?: string
          id?: string
          marca?: Database["public"]["Enums"]["marca"]
          nombre?: string
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Relationships: []
      }
      parque_stock_maquinas: {
        Row: {
          carga_id: string
          chasis: string | null
          datos_fuente: Json
          deposito: string | null
          estado: string | null
          filial_original: string | null
          id: string
          importado_en: string
          marca: string | null
          modelo: string | null
          producto_codigo: string
          saldo_actual: number
          source_row: number | null
          stock_key: string
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo: string | null
        }
        Insert: {
          carga_id: string
          chasis?: string | null
          datos_fuente?: Json
          deposito?: string | null
          estado?: string | null
          filial_original?: string | null
          id?: string
          importado_en?: string
          marca?: string | null
          modelo?: string | null
          producto_codigo: string
          saldo_actual?: number
          source_row?: number | null
          stock_key: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo?: string | null
        }
        Update: {
          carga_id?: string
          chasis?: string | null
          datos_fuente?: Json
          deposito?: string | null
          estado?: string | null
          filial_original?: string | null
          id?: string
          importado_en?: string
          marca?: string | null
          modelo?: string | null
          producto_codigo?: string
          saldo_actual?: number
          source_row?: number | null
          stock_key?: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo?: string | null
        }
        Relationships: []
      }
      parque_ultima_actividad: {
        Row: {
          actualizado_en: string
          cliente_id: string
          marca: string
          ultima_os: string | null
          ultima_venta_repuestos: string | null
          ultimo_servicio_facturado: string | null
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          marca?: string
          ultima_os?: string | null
          ultima_venta_repuestos?: string | null
          ultimo_servicio_facturado?: string | null
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          marca?: string
          ultima_os?: string | null
          ultima_venta_repuestos?: string | null
          ultimo_servicio_facturado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parque_ultima_actividad_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_ultima_actividad_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          actualizado_en: string
          codigo_fabricante: string | null
          codigo_interno: string
          descripcion: string
          familia: string | null
          grupo: string | null
          incorporado_en: string
          marca: Database["public"]["Enums"]["marca"]
          unidad: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          codigo_fabricante?: string | null
          codigo_interno: string
          descripcion: string
          familia?: string | null
          grupo?: string | null
          incorporado_en?: string
          marca?: Database["public"]["Enums"]["marca"]
          unidad?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          codigo_fabricante?: string | null
          codigo_interno?: string
          descripcion?: string
          familia?: string | null
          grupo?: string | null
          incorporado_en?: string
          marca?: Database["public"]["Enums"]["marca"]
          unidad?: string | null
        }
        Relationships: []
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
      repuestos_articulo_planificacion: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          criticidad: string | null
          criticidad_confianza: number
          criticidad_fuente: string
          observaciones: string | null
          origen: string
          producto_codigo: string
          stock_minimo_estrategico: number
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          criticidad?: string | null
          criticidad_confianza?: number
          criticidad_fuente?: string
          observaciones?: string | null
          origen?: string
          producto_codigo: string
          stock_minimo_estrategico?: number
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          criticidad?: string | null
          criticidad_confianza?: number
          criticidad_fuente?: string
          observaciones?: string | null
          origen?: string
          producto_codigo?: string
          stock_minimo_estrategico?: number
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_articulo_planificacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_articulo_planificacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: true
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_articulo_planificacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: true
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_codigo_equivalencias: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          codigo_fabricante_legacy: string
          codigo_legacy: string
          confianza: number
          manual: boolean
          marca: Database["public"]["Enums"]["marca"]
          metodo: string
          producto_codigo: string
          requiere_revision: boolean
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          codigo_fabricante_legacy?: string
          codigo_legacy: string
          confianza?: number
          manual?: boolean
          marca: Database["public"]["Enums"]["marca"]
          metodo: string
          producto_codigo: string
          requiere_revision?: boolean
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          codigo_fabricante_legacy?: string
          codigo_legacy?: string
          confianza?: number
          manual?: boolean
          marca?: Database["public"]["Enums"]["marca"]
          metodo?: string
          producto_codigo?: string
          requiere_revision?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_codigo_equivalencias_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_codigo_equivalencias_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_codigo_equivalencias_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_conversiones_unidad_historica: {
        Row: {
          activa: boolean
          actualizado_en: string
          codigo_legacy_norm: string
          creado_en: string
          factor_cantidad: number
          fecha_desde: string | null
          fecha_hasta_exclusiva: string | null
          fuente: string | null
          id: number
          motivo: string
          precio_unitario_max: number | null
          precio_unitario_min: number | null
          regla_clave: string
          unidad_destino: string
          unidad_origen: string
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          codigo_legacy_norm: string
          creado_en?: string
          factor_cantidad: number
          fecha_desde?: string | null
          fecha_hasta_exclusiva?: string | null
          fuente?: string | null
          id?: never
          motivo: string
          precio_unitario_max?: number | null
          precio_unitario_min?: number | null
          regla_clave: string
          unidad_destino: string
          unidad_origen: string
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          codigo_legacy_norm?: string
          creado_en?: string
          factor_cantidad?: number
          fecha_desde?: string | null
          fecha_hasta_exclusiva?: string | null
          fuente?: string | null
          id?: never
          motivo?: string
          precio_unitario_max?: number | null
          precio_unitario_min?: number | null
          regla_clave?: string
          unidad_destino?: string
          unidad_origen?: string
        }
        Relationships: []
      }
      repuestos_corrida_resultados: {
        Row: {
          abc: string
          codigo_fabricante: string | null
          codigo_mix: string | null
          coeficiente_variacion: number
          corrida_id: string
          criticidad: string | null
          criticidad_confianza: number
          criticidad_fuente: string
          criticidad_revisar: boolean
          demanda_horizonte: number
          demanda_ponderada_mensual: number
          descripcion: string
          desviacion_mensual_12m: number
          dias_ultima_venta: number | null
          estado_datos: string
          explicacion: Json
          familia: string | null
          fsn: string
          horizonte_meses: number
          incorporado_en: string | null
          marca: Database["public"]["Enums"]["marca"]
          media_mensual_12m: number
          meses_venta_12m: number
          necesidad_neta: number
          origen: string
          pedidos_12m: number
          pedidos_24m: number
          producto_codigo: string
          segmento: string
          stock_global: number
          stock_minimo_estrategico: number
          stock_objetivo: number
          stock_seguridad: number
          sugerencia_unidades: number
          total_vendido_12m: number
          total_vendido_24m: number
          ultima_venta: string | null
          unidades_12m: number
          unidades_24m: number
          ved: string | null
          xyz: string
        }
        Insert: {
          abc: string
          codigo_fabricante?: string | null
          codigo_mix?: string | null
          coeficiente_variacion?: number
          corrida_id: string
          criticidad?: string | null
          criticidad_confianza?: number
          criticidad_fuente?: string
          criticidad_revisar?: boolean
          demanda_horizonte?: number
          demanda_ponderada_mensual?: number
          descripcion: string
          desviacion_mensual_12m?: number
          dias_ultima_venta?: number | null
          estado_datos: string
          explicacion?: Json
          familia?: string | null
          fsn: string
          horizonte_meses?: number
          incorporado_en?: string | null
          marca: Database["public"]["Enums"]["marca"]
          media_mensual_12m?: number
          meses_venta_12m?: number
          necesidad_neta?: number
          origen: string
          pedidos_12m?: number
          pedidos_24m?: number
          producto_codigo: string
          segmento: string
          stock_global?: number
          stock_minimo_estrategico?: number
          stock_objetivo?: number
          stock_seguridad?: number
          sugerencia_unidades?: number
          total_vendido_12m?: number
          total_vendido_24m?: number
          ultima_venta?: string | null
          unidades_12m?: number
          unidades_24m?: number
          ved?: string | null
          xyz: string
        }
        Update: {
          abc?: string
          codigo_fabricante?: string | null
          codigo_mix?: string | null
          coeficiente_variacion?: number
          corrida_id?: string
          criticidad?: string | null
          criticidad_confianza?: number
          criticidad_fuente?: string
          criticidad_revisar?: boolean
          demanda_horizonte?: number
          demanda_ponderada_mensual?: number
          descripcion?: string
          desviacion_mensual_12m?: number
          dias_ultima_venta?: number | null
          estado_datos?: string
          explicacion?: Json
          familia?: string | null
          fsn?: string
          horizonte_meses?: number
          incorporado_en?: string | null
          marca?: Database["public"]["Enums"]["marca"]
          media_mensual_12m?: number
          meses_venta_12m?: number
          necesidad_neta?: number
          origen?: string
          pedidos_12m?: number
          pedidos_24m?: number
          producto_codigo?: string
          segmento?: string
          stock_global?: number
          stock_minimo_estrategico?: number
          stock_objetivo?: number
          stock_seguridad?: number
          sugerencia_unidades?: number
          total_vendido_12m?: number
          total_vendido_24m?: number
          ultima_venta?: string | null
          unidades_12m?: number
          unidades_24m?: number
          ved?: string | null
          xyz?: string
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_corrida_resultados_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "repuestos_corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repuestos_corrida_resultados_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_corrida_resultados_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_corrida_resultados_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_corridas: {
        Row: {
          alcance: string
          completado_en: string | null
          creado_en: string
          creado_por: string
          estado: string
          fecha_analisis: string
          fuentes_snapshot: Json
          id: string
          marca: Database["public"]["Enums"]["marca"]
          modelo_version_id: string
          nombre: string
          parametros_snapshot: Json
          pendientes_criticidad: number
          piezas_nuevas_sin_historial: number
          piezas_sin_ventas: number
          piezas_sin_ventas_recientes: number
          piezas_sugeridas: number
          total_piezas: number
          unidades_sugeridas: number
        }
        Insert: {
          alcance?: string
          completado_en?: string | null
          creado_en?: string
          creado_por: string
          estado?: string
          fecha_analisis: string
          fuentes_snapshot?: Json
          id?: string
          marca: Database["public"]["Enums"]["marca"]
          modelo_version_id: string
          nombre: string
          parametros_snapshot?: Json
          pendientes_criticidad?: number
          piezas_nuevas_sin_historial?: number
          piezas_sin_ventas?: number
          piezas_sin_ventas_recientes?: number
          piezas_sugeridas?: number
          total_piezas?: number
          unidades_sugeridas?: number
        }
        Update: {
          alcance?: string
          completado_en?: string | null
          creado_en?: string
          creado_por?: string
          estado?: string
          fecha_analisis?: string
          fuentes_snapshot?: Json
          id?: string
          marca?: Database["public"]["Enums"]["marca"]
          modelo_version_id?: string
          nombre?: string
          parametros_snapshot?: Json
          pendientes_criticidad?: number
          piezas_nuevas_sin_historial?: number
          piezas_sin_ventas?: number
          piezas_sin_ventas_recientes?: number
          piezas_sugeridas?: number
          total_piezas?: number
          unidades_sugeridas?: number
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_corridas_modelo_version_id_fkey"
            columns: ["modelo_version_id"]
            isOneToOne: false
            referencedRelation: "repuestos_modelo_versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      repuestos_demanda_mensual: {
        Row: {
          actualizado_en: string
          devoluciones: number
          importe_comparable: number
          mes: string
          pedidos: number
          producto_codigo: string
          unidades_netas: number
          unidades_positivas: number
        }
        Insert: {
          actualizado_en?: string
          devoluciones?: number
          importe_comparable?: number
          mes: string
          pedidos?: number
          producto_codigo: string
          unidades_netas?: number
          unidades_positivas?: number
        }
        Update: {
          actualizado_en?: string
          devoluciones?: number
          importe_comparable?: number
          mes?: string
          pedidos?: number
          producto_codigo?: string
          unidades_netas?: number
          unidades_positivas?: number
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_demanda_mensual_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_demanda_mensual_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_demanda_mensual_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_facturacion_historica_cargas: {
        Row: {
          activo: boolean
          archivo_nombre: string
          completado_en: string | null
          creado_en: string
          creado_por: string | null
          estado: string
          filas_archivo: number
          filas_recibidas: number
          id: string
          lineas_vinculadas: number
          productos_vinculados: number
          publicacion_estado: string | null
          publicacion_hasta: string | null
          publicado_en: string | null
        }
        Insert: {
          activo?: boolean
          archivo_nombre: string
          completado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          filas_archivo?: number
          filas_recibidas?: number
          id?: string
          lineas_vinculadas?: number
          productos_vinculados?: number
          publicacion_estado?: string | null
          publicacion_hasta?: string | null
          publicado_en?: string | null
        }
        Update: {
          activo?: boolean
          archivo_nombre?: string
          completado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          filas_archivo?: number
          filas_recibidas?: number
          id?: string
          lineas_vinculadas?: number
          productos_vinculados?: number
          publicacion_estado?: string | null
          publicacion_hasta?: string | null
          publicado_en?: string | null
        }
        Relationships: []
      }
      repuestos_historial_actualizaciones: {
        Row: {
          ambiguas: number
          completado_en: string | null
          confirmadas: number
          detalle: Json
          ejecutado_por: string | null
          estado: string
          id: number
          iniciado_en: string
          lineas_totales: number
          sin_coincidencia: number
        }
        Insert: {
          ambiguas?: number
          completado_en?: string | null
          confirmadas?: number
          detalle?: Json
          ejecutado_por?: string | null
          estado: string
          id?: never
          iniciado_en?: string
          lineas_totales?: number
          sin_coincidencia?: number
        }
        Update: {
          ambiguas?: number
          completado_en?: string | null
          confirmadas?: number
          detalle?: Json
          ejecutado_por?: string | null
          estado?: string
          id?: never
          iniciado_en?: string
          lineas_totales?: number
          sin_coincidencia?: number
        }
        Relationships: []
      }
      repuestos_legacy_vinculos_manuales: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          codigo_legacy: string
          codigo_legacy_norm: string
          creado_en: string
          producto_codigo: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          codigo_legacy: string
          codigo_legacy_norm: string
          creado_en?: string
          producto_codigo: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          codigo_legacy?: string
          codigo_legacy_norm?: string
          creado_en?: string
          producto_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_legacy_vinculos_manuales_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_legacy_vinculos_manuales_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_legacy_vinculos_manuales_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_maestro_legacy: {
        Row: {
          actualizado_en: string
          candidatos: string[]
          carga_id: string
          codigo_fabricante: string | null
          codigo_fabricante_norm: string | null
          codigo_legacy: string
          codigo_legacy_norm: string
          descripcion: string
          estado_vinculo: string
          metodo_vinculo: string | null
          producto_codigo: string | null
          situacion: string | null
          tipo: string | null
        }
        Insert: {
          actualizado_en?: string
          candidatos?: string[]
          carga_id: string
          codigo_fabricante?: string | null
          codigo_fabricante_norm?: string | null
          codigo_legacy: string
          codigo_legacy_norm: string
          descripcion: string
          estado_vinculo?: string
          metodo_vinculo?: string | null
          producto_codigo?: string | null
          situacion?: string | null
          tipo?: string | null
        }
        Update: {
          actualizado_en?: string
          candidatos?: string[]
          carga_id?: string
          codigo_fabricante?: string | null
          codigo_fabricante_norm?: string | null
          codigo_legacy?: string
          codigo_legacy_norm?: string
          descripcion?: string
          estado_vinculo?: string
          metodo_vinculo?: string | null
          producto_codigo?: string | null
          situacion?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_maestro_legacy_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "repuestos_maestro_legacy_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repuestos_maestro_legacy_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_maestro_legacy_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_maestro_legacy_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_maestro_legacy_cargas: {
        Row: {
          activo: boolean
          archivo_nombre: string
          canonicas: number
          completado_en: string | null
          creado_en: string
          creado_por: string | null
          estado: string
          filas: number
          id: string
          sin_coincidencia: number
          vinculadas: number
        }
        Insert: {
          activo?: boolean
          archivo_nombre: string
          canonicas?: number
          completado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          filas?: number
          id?: string
          sin_coincidencia?: number
          vinculadas?: number
        }
        Update: {
          activo?: boolean
          archivo_nombre?: string
          canonicas?: number
          completado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          filas?: number
          id?: string
          sin_coincidencia?: number
          vinculadas?: number
        }
        Relationships: []
      }
      repuestos_modelo_reglas_mix: {
        Row: {
          codigo_mix: string
          modelo_version_id: string
          segmento: string
        }
        Insert: {
          codigo_mix: string
          modelo_version_id: string
          segmento: string
        }
        Update: {
          codigo_mix?: string
          modelo_version_id?: string
          segmento?: string
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_modelo_reglas_mix_modelo_version_id_fkey"
            columns: ["modelo_version_id"]
            isOneToOne: false
            referencedRelation: "repuestos_modelo_versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      repuestos_modelo_segmentos: {
        Row: {
          descripcion: string | null
          modelo_version_id: string
          nivel_servicio: number | null
          revision_meses: number
          segmento: string
          valor_z: number
        }
        Insert: {
          descripcion?: string | null
          modelo_version_id: string
          nivel_servicio?: number | null
          revision_meses: number
          segmento: string
          valor_z: number
        }
        Update: {
          descripcion?: string | null
          modelo_version_id?: string
          nivel_servicio?: number | null
          revision_meses?: number
          segmento?: string
          valor_z?: number
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_modelo_segmentos_modelo_version_id_fkey"
            columns: ["modelo_version_id"]
            isOneToOne: false
            referencedRelation: "repuestos_modelo_versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      repuestos_modelo_versiones: {
        Row: {
          abc_limite_a: number
          abc_limite_b: number
          activa: boolean
          adi_intermitente_umbral: number
          ciclo_planificacion_meses: number
          cobertura_margen_meses: number
          creado_en: string
          creado_por: string | null
          cv2_erratico_umbral: number
          fsn_dias_f: number
          fsn_dias_n: number
          fsn_pedidos_f: number
          id: string
          lead_time_meses: number
          marca: Database["public"]["Enums"]["marca"]
          nombre: string
          origen_predeterminado: string
          pedido_unico_cobertura_meses: number
          peso_anterior: number
          peso_reciente: number
          stock_seguridad_tope: number
          tendencia_caida_tope: number
          tendencia_caida_umbral: number
          version: number
          xyz_cv_x: number
          xyz_cv_y: number
          xyz_meses_x: number
          xyz_meses_y_max: number
          xyz_meses_y_min: number
        }
        Insert: {
          abc_limite_a?: number
          abc_limite_b?: number
          activa?: boolean
          adi_intermitente_umbral?: number
          ciclo_planificacion_meses?: number
          cobertura_margen_meses?: number
          creado_en?: string
          creado_por?: string | null
          cv2_erratico_umbral?: number
          fsn_dias_f?: number
          fsn_dias_n?: number
          fsn_pedidos_f?: number
          id?: string
          lead_time_meses: number
          marca: Database["public"]["Enums"]["marca"]
          nombre: string
          origen_predeterminado?: string
          pedido_unico_cobertura_meses?: number
          peso_anterior?: number
          peso_reciente?: number
          stock_seguridad_tope?: number
          tendencia_caida_tope?: number
          tendencia_caida_umbral?: number
          version: number
          xyz_cv_x?: number
          xyz_cv_y?: number
          xyz_meses_x?: number
          xyz_meses_y_max?: number
          xyz_meses_y_min?: number
        }
        Update: {
          abc_limite_a?: number
          abc_limite_b?: number
          activa?: boolean
          adi_intermitente_umbral?: number
          ciclo_planificacion_meses?: number
          cobertura_margen_meses?: number
          creado_en?: string
          creado_por?: string | null
          cv2_erratico_umbral?: number
          fsn_dias_f?: number
          fsn_dias_n?: number
          fsn_pedidos_f?: number
          id?: string
          lead_time_meses?: number
          marca?: Database["public"]["Enums"]["marca"]
          nombre?: string
          origen_predeterminado?: string
          pedido_unico_cobertura_meses?: number
          peso_anterior?: number
          peso_reciente?: number
          stock_seguridad_tope?: number
          tendencia_caida_tope?: number
          tendencia_caida_umbral?: number
          version?: number
          xyz_cv_x?: number
          xyz_cv_y?: number
          xyz_meses_x?: number
          xyz_meses_y_max?: number
          xyz_meses_y_min?: number
        }
        Relationships: []
      }
      repuestos_productos_alias: {
        Row: {
          activo: boolean
          actualizado_en: string
          alias_codigo: string
          creado_en: string
          motivo: string
          producto_canonico: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          alias_codigo: string
          creado_en?: string
          motivo: string
          producto_canonico: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          alias_codigo?: string
          creado_en?: string
          motivo?: string
          producto_canonico?: string
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_productos_alias_alias_codigo_fkey"
            columns: ["alias_codigo"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_productos_alias_alias_codigo_fkey"
            columns: ["alias_codigo"]
            isOneToOne: true
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_productos_alias_alias_codigo_fkey"
            columns: ["alias_codigo"]
            isOneToOne: true
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
          {
            foreignKeyName: "repuestos_productos_alias_producto_canonico_fkey"
            columns: ["producto_canonico"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_productos_alias_producto_canonico_fkey"
            columns: ["producto_canonico"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_productos_alias_producto_canonico_fkey"
            columns: ["producto_canonico"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
      repuestos_stock: {
        Row: {
          codigo_fabricante: string | null
          deposito: string | null
          descripcion: string | null
          id: string
          importado_en: string
          producto_codigo: string
          saldo_actual: number
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          unidad: string | null
        }
        Insert: {
          codigo_fabricante?: string | null
          deposito?: string | null
          descripcion?: string | null
          id?: string
          importado_en?: string
          producto_codigo: string
          saldo_actual?: number
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          unidad?: string | null
        }
        Update: {
          codigo_fabricante?: string | null
          deposito?: string | null
          descripcion?: string | null
          id?: string
          importado_en?: string
          producto_codigo?: string
          saldo_actual?: number
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          unidad?: string | null
        }
        Relationships: []
      }
      repuestos_ventas_duplicadas: {
        Row: {
          clave_comercial: string
          detectado_en: string
          linea_canonica_id: string
          linea_id: string
          origen_canonico: string | null
          origen_descartado: string | null
        }
        Insert: {
          clave_comercial: string
          detectado_en?: string
          linea_canonica_id: string
          linea_id: string
          origen_canonico?: string | null
          origen_descartado?: string | null
        }
        Update: {
          clave_comercial?: string
          detectado_en?: string
          linea_canonica_id?: string
          linea_id?: string
          origen_canonico?: string | null
          origen_descartado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_ventas_duplicadas_linea_canonica_id_fkey"
            columns: ["linea_canonica_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repuestos_ventas_duplicadas_linea_canonica_id_fkey"
            columns: ["linea_canonica_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "repuestos_ventas_duplicadas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: true
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repuestos_ventas_duplicadas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: true
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      repuestos_ventas_vinculacion: {
        Row: {
          actualizado_en: string
          candidatos: string[]
          cantidad: number
          cantidad_candidatos: number
          confianza: number
          estado_vinculo: string
          fecha_efectiva: string | null
          linea_id: string
          marca_origen: Database["public"]["Enums"]["marca"]
          metodo_vinculo: string | null
          moneda: string | null
          prioridad: number | null
          producto_codigo: string | null
          unidad_producto: string | null
        }
        Insert: {
          actualizado_en?: string
          candidatos?: string[]
          cantidad?: number
          cantidad_candidatos?: number
          confianza?: number
          estado_vinculo: string
          fecha_efectiva?: string | null
          linea_id: string
          marca_origen?: Database["public"]["Enums"]["marca"]
          metodo_vinculo?: string | null
          moneda?: string | null
          prioridad?: number | null
          producto_codigo?: string | null
          unidad_producto?: string | null
        }
        Update: {
          actualizado_en?: string
          candidatos?: string[]
          cantidad?: number
          cantidad_candidatos?: number
          confianza?: number
          estado_vinculo?: string
          fecha_efectiva?: string | null
          linea_id?: string
          marca_origen?: Database["public"]["Enums"]["marca"]
          metodo_vinculo?: string | null
          moneda?: string | null
          prioridad?: number | null
          producto_codigo?: string | null
          unidad_producto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_ventas_vinculacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: true
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: true
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
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
      seguimiento_pedidos: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          estado_seguimiento: string
          fecha_estimada_llegada: string | null
          notas: string | null
          nro_pedido: string
          nro_seguimiento: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          estado_seguimiento?: string
          fecha_estimada_llegada?: string | null
          notas?: string | null
          nro_pedido: string
          nro_seguimiento?: string | null
          sucursal: Database["public"]["Enums"]["sucursal"]
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          estado_seguimiento?: string
          fecha_estimada_llegada?: string | null
          notas?: string | null
          nro_pedido?: string
          nro_seguimiento?: string | null
          sucursal?: Database["public"]["Enums"]["sucursal"]
        }
        Relationships: []
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
      user_modulo_acceso: {
        Row: {
          modulo_id: string
          otorgado_en: string
          user_id: string
        }
        Insert: {
          modulo_id: string
          otorgado_en?: string
          user_id: string
        }
        Update: {
          modulo_id?: string
          otorgado_en?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_modulo_acceso_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
        ]
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
      maquinaria_importaciones_lineas_operativas: {
        Row: {
          actualizado_en: string | null
          ata: string | null
          cantidad: number | null
          chasis: string | null
          cliente_nombre: string | null
          comercial: string | null
          costo_final: number | null
          costo_final_sin_iva: number | null
          creado_en: string | null
          datos_fuente: Json | null
          descuento_especial: number | null
          descuentos: number | null
          destino: string | null
          diferencia: number | null
          disponibilidad_detalle: string | null
          estado_disponibilidad: string | null
          estado_fuente: string | null
          eta: string | null
          factura_venta: string | null
          flete_seguro: number | null
          id: string | null
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          marca: string | null
          margen_porcentaje: number | null
          modelo: string | null
          notas: string | null
          np_fecha: string | null
          np_numero: string | null
          oc: string | null
          operacion_id: string | null
          origen: string | null
          po: string | null
          precio_oc: number | null
          precio_teorico_oc: number | null
          prioridad: string | null
          producto: string | null
          producto_facturado: string | null
          proveedor: string | null
          proveedor_flete: string | null
          situacion_vinculo: string | null
          source_id: string | null
          source_row: number | null
          source_sheet: string | null
          stock_deposito: string | null
          stock_saldo: number | null
          stock_sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo_cambio: number | null
          transporte: string | null
          unidad_id: string | null
          utilidad: number | null
          valor_venta: number | null
          venta_facturada: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_operaciones_resumen: {
        Row: {
          actualizado_en: string | null
          cliente_id: string | null
          cliente_nombre: string | null
          comercial: string | null
          creado_en: string | null
          documentos: number | null
          estado: string | null
          id: string | null
          incluye_marca_admitida: boolean | null
          lineas: number | null
          marcas: string | null
          np_fecha: string | null
          np_numero: string | null
          observaciones: string | null
          requiere_importacion: boolean | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_operaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_operaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_pedidos_lineas_operativas: {
        Row: {
          abastecimiento: string | null
          actualizado_en: string | null
          ata: string | null
          cantidad: number | null
          chasis: string | null
          cliente_nombre: string | null
          comercial: string | null
          condicion: string | null
          costo_producto: number | null
          disponibilidad_detalle: string | null
          estado_disponibilidad: string | null
          estado_fuente: string | null
          estado_importacion_fuente: string | null
          eta: string | null
          factura_fecha: string | null
          factura_venta: string | null
          id: string | null
          importacion_linea_id: string | null
          linea_id: string | null
          linea_numero: number | null
          marca: string | null
          modelo: string | null
          moneda: string | null
          np_fecha: string | null
          np_numero: string | null
          observaciones: string | null
          operacion_id: string | null
          producto: string | null
          proveedor: string | null
          unidad_id: string | null
          valor_facturado: number | null
          valor_venta: number | null
        }
        Relationships: []
      }
      maquinaria_planificador_resumen: {
        Row: {
          abastecimiento: string | null
          ata: string | null
          cantidad: number | null
          chasis: string | null
          cliente_nombre: string | null
          costo_final: number | null
          estado_fuente: string | null
          eta: string | null
          fecha_referencia: string | null
          id: string | null
          importacion_linea_id: string | null
          invoice_supplier: string | null
          marca: string | null
          modelo: string | null
          np_numero: string | null
          oc: string | null
          operacion_id: string | null
          po: string | null
          producto: string | null
          proveedor: string | null
          situacion_vinculo: string | null
          tipo_registro: string | null
          valor_venta: number | null
          venta_facturada: string | null
        }
        Relationships: []
      }
      maquinaria_stock_trazabilidad: {
        Row: {
          ata: string | null
          carga_id: string | null
          chasis: string | null
          chasis_normalizado: string | null
          cliente_nombre: string | null
          comercial: string | null
          datos_fuente: Json | null
          deposito: string | null
          disponibilidad_detalle: string | null
          estado: string | null
          estado_disponibilidad: string | null
          estado_importacion_fuente: string | null
          estado_operacion: string | null
          estado_pedido_fuente: string | null
          eta: string | null
          filial_original: string | null
          id: string | null
          importacion_linea_id: string | null
          importado_en: string | null
          linea_operacion_id: string | null
          marca: string | null
          modelo: string | null
          np_fecha: string | null
          np_numero: string | null
          oc: string | null
          operacion_id: string | null
          parque_cliente_id: string | null
          parque_maquina_id: string | null
          po: string | null
          producto_codigo: string | null
          proveedor: string | null
          repeticiones_chasis: number | null
          saldo_actual: number | null
          situacion_vinculo: string | null
          source_row: number | null
          stock_key: string | null
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo: string | null
          unidad_operacion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parque_maquinas_cliente_id_fkey"
            columns: ["parque_cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_maquinas_cliente_id_fkey"
            columns: ["parque_cliente_id"]
            isOneToOne: false
            referencedRelation: "v_clientes_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      repuestos_ventas_duplicados_detectados: {
        Row: {
          clave_comercial: string | null
          linea_canonica_id: string | null
          linea_id: string | null
          origen_canonico: string | null
          origen_descartado: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_ventas_vinculacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: true
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: true
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      repuestos_ventas_posibles_duplicadas_mismo_origen: {
        Row: {
          cantidad: number | null
          cliente_norm: string | null
          factura_norm: string | null
          fecha_efectiva: string | null
          lineas: string[] | null
          lineas_fuente: string[] | null
          origen_sistema: string | null
          producto_codigo: string | null
          repeticiones: number | null
          total_venta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_ventas_vinculacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_stock_matriz"
            referencedColumns: ["codigo_interno"]
          },
          {
            foreignKeyName: "repuestos_ventas_vinculacion_producto_codigo_fkey"
            columns: ["producto_codigo"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["producto_codigo"]
          },
        ]
      }
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
      v_compras_pedidos_resumen: {
        Row: {
          cantidad_items: number | null
          cantidad_pendiente_total: number | null
          estado_seguimiento: string | null
          fecha_emision: string | null
          fecha_estimada_llegada: string | null
          moneda: string | null
          notas: string | null
          nro_pedido: string | null
          nro_seguimiento: string | null
          proveedor_codigo: string | null
          proveedor_nombre: string | null
          seguimiento_actualizado_en: string | null
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          valor_total: number | null
        }
        Relationships: []
      }
      v_compras_solicitudes_resumen: {
        Row: {
          cantidad_items: number | null
          fecha_emision: string | null
          moneda: string | null
          nro_solicitud: string | null
          solicitante: string | null
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          valor_total: number | null
        }
        Relationships: []
      }
      v_repuestos_reporte_claas: {
        Row: {
          codigo_fabricante: string | null
          codigo_interno: string | null
          descripcion: string | null
          marca: string | null
          origen_sistema: string | null
          stock: number | null
          ventas_12m: number | null
          ventas_24m: number | null
          ventas_36m: number | null
        }
        Relationships: []
      }
      v_repuestos_stock_matriz: {
        Row: {
          campo_9: number | null
          codigo_fabricante: string | null
          codigo_interno: string | null
          descripcion: string | null
          familia: string | null
          katuete: number | null
          loma_plata: number | null
          marca: Database["public"]["Enums"]["marca"] | null
          misiones: number | null
          santa_rita: number | null
          santa_rosa: number | null
          total: number | null
          unidad: string | null
        }
        Relationships: []
      }
      v_repuestos_stock_ventas_exportacion: {
        Row: {
          campo_9: number | null
          codigo: string | null
          codigo_fabricante: string | null
          codigos_anteriores: string | null
          descripcion: string | null
          estado_producto: string | null
          estado_vinculo: string | null
          familia: string | null
          fecha_corte: string | null
          katuete: number | null
          loma_plata: number | null
          marca: string | null
          misiones: number | null
          origen: string | null
          santa_rita: number | null
          santa_rosa: number | null
          stock_total: number | null
          unidad: string | null
          ventas_12m: number | null
          ventas_24m: number | null
          ventas_36m: number | null
        }
        Relationships: []
      }
      v_repuestos_ventas_unificadas: {
        Row: {
          cantidad: number | null
          cliente: string | null
          codigo_fabricante_facturado: string | null
          codigo_facturado: string | null
          descripcion_facturada: string | null
          factura: string | null
          fecha_factura: string | null
          linea_id: string | null
          metodo_vinculo: string | null
          origen_sistema: string | null
          producto_codigo: string | null
          producto_codigo_fabricante: string | null
          producto_descripcion: string | null
          producto_familia: string | null
          producto_marca: Database["public"]["Enums"]["marca"] | null
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          total_venta_usd: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      comisiones_actualizar_tipo_tiempo: {
        Args: { p_jornada_id: string; p_tipo_tiempo: string }
        Returns: string
      }
      comisiones_clave_ajuste_tipo_tiempo: {
        Args: {
          p_fecha_fin: string
          p_fecha_inicio: string
          p_hora_fin: string
          p_hora_inicio: string
          p_os_numero: string
          p_tecnico_codigo: string
          p_tecnico_nombre: string
          p_tecnico_profile_id: string
        }
        Returns: string
      }
      comisiones_marcar_pagadas: {
        Args: {
          p_jornada_ids: string[]
          p_observacion?: string
          p_periodo_desde: string
          p_periodo_hasta: string
        }
        Returns: string
      }
      comisiones_preparar_reimportacion: {
        Args: { p_os_numeros: string[] }
        Returns: number
      }
      comisiones_reconstruir_participantes_heredados: {
        Args: never
        Returns: Json
      }
      comisiones_reemplazar_jornadas: {
        Args: { p_jornadas: Json; p_os_numeros: string[] }
        Returns: Json
      }
      comisiones_validar_jornadas: {
        Args: { p_jornada_ids: string[]; p_observacion?: string }
        Returns: number
      }
      confirmar_notificacion_alta_maquina: {
        Args: {
          p_anio?: number
          p_cliente_id: string
          p_localidad?: string
          p_marca: Database["public"]["Enums"]["marca"]
          p_modelo_tipo: string
          p_notas?: string
          p_notificacion_id: string
          p_serie: string
          p_subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
          p_sucursal?: Database["public"]["Enums"]["sucursal"]
          p_vendedor?: string
        }
        Returns: string
      }
      descartar_notificacion_venta_maquina: {
        Args: { p_notificacion_id: string }
        Returns: undefined
      }
      es_linea_facturacion_repuesto: {
        Args: {
          p_grupo_normalizado: string
          p_subgrupo_original: string
          p_tipo: Database["public"]["Enums"]["tipo_facturacion"]
        }
        Returns: boolean
      }
      extraer_chasis_venta_maquina: {
        Args: { p_os_numero?: string; p_raw_data: Json; p_texto: string }
        Returns: string
      }
      extraer_codigo_repuesto_descripcion: {
        Args: { p_descripcion: string }
        Returns: string
      }
      facturacion_tipo_tiempo_campos: {
        Args: { p_entidad: string; p_observacion: string }
        Returns: string
      }
      generar_notificacion_venta_maquina: {
        Args: { p_linea_id: string }
        Returns: string
      }
      get_user_sucursal: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["sucursal"]
      }
      has_module_access: {
        Args: { _modulo_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inferir_subgrupo_maquina_notificacion: {
        Args: { p_texto: string }
        Returns: Database["public"]["Enums"]["subgrupo_maquina"]
      }
      maquinaria_importar_historico_pedidos: {
        Args: { p_filas: Json }
        Returns: Json
      }
      maquinaria_importar_maestro_importaciones: {
        Args: { p_filas: Json }
        Returns: Json
      }
      maquinaria_marca_admitida: {
        Args: { p_marca: Database["public"]["Enums"]["marca"] }
        Returns: boolean
      }
      maquinaria_registrar_operacion: {
        Args: { p_lineas: Json; p_operacion: Json }
        Returns: string
      }
      normalizar_chasis_notificacion: {
        Args: { p_valor: string }
        Returns: string
      }
      normalizar_codigo_repuesto: {
        Args: { p_codigo: string }
        Returns: string
      }
      normalizar_codigo_repuesto_flexible: {
        Args: { p_codigo: string }
        Returns: string
      }
      normalizar_descripcion_repuesto_comparable: {
        Args: { p_texto: string }
        Returns: string
      }
      normalizar_texto_repuesto: { Args: { p_texto: string }; Returns: string }
      notificaciones_marcar_vista: {
        Args: { p_notificacion_id: string }
        Returns: undefined
      }
      parque_actividad_os_chasis: {
        Args: never
        Returns: {
          cliente_id: string
          fecha: string
          marca: string
          os_numero: string
        }[]
      }
      parque_actividad_os_chasis_rango: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cliente_id: string
          fecha: string
          marca: string
          os_numero: string
        }[]
      }
      parque_facturacion_atribuida: {
        Args: never
        Returns: {
          cliente_id: string
          fecha: string
          grupo_fx: string
          marca: string
          rubro: string
          total_venta: number
        }[]
      }
      parque_facturacion_atribuida_rango: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cliente_id: string
          fecha: string
          grupo_fx: string
          marca: string
          rubro: string
          total_venta: number
        }[]
      }
      parque_facturacion_legacy_fallback_rango: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cliente_id: string
          fecha: string
          grupo_fx: string
          marca: string
          rubro: string
          total_venta: number
        }[]
      }
      parque_facturas_chasis_atribuidas: {
        Args: never
        Returns: {
          cliente_id: string
          factura_clave: string
          marca: string
        }[]
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
      parque_modelo_clave: { Args: { p_modelo: string }; Returns: string }
      parque_modelo_nombre: { Args: { p_modelo: string }; Returns: string }
      parque_normalizar_clave: { Args: { p_valor: string }; Returns: string }
      parque_reemplazar_stock_maquinas: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      parque_refrescar_factura_os_cliente: { Args: never; Returns: number }
      parque_resolver_cliente_linea_facturacion: {
        Args: {
          p_codigo_interno_factura: string
          p_entidad_nombre: string
          p_factura: string
          p_fecha_factura: string
          p_sucursal: Database["public"]["Enums"]["sucursal"]
        }
        Returns: {
          cliente_id: string
          marca: string
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
      parque_resumen_facturacion_filtros: {
        Args: {
          p_desde: string
          p_hasta: string
          p_marca: string
          p_prev_desde: string
          p_prev_hasta: string
          p_rubro: string
        }
        Returns: {
          cliente_id: string
          fact_actual: number
          fact_prev: number
          tiene_rep_rango: boolean
          tiene_srv_rango: boolean
        }[]
      }
      parque_resumen_facturacion_marca: {
        Args: {
          p_desde: string
          p_hasta: string
          p_marca: string
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
      parque_ultimas_facturas_marca: {
        Args: { p_marca: string }
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
      refrescar_parque_ultima_actividad: { Args: never; Returns: number }
      repuesto_hermanos: { Args: { p_producto_codigo: string }; Returns: Json }
      repuesto_ventas_historial: {
        Args: { p_producto_codigo: string }
        Returns: Json
      }
      repuestos_aplicar_conversiones_unidad_historica: {
        Args: never
        Returns: Json
      }
      repuestos_asignar_criticidad: {
        Args: {
          p_criticidad: string
          p_observaciones?: string
          p_origen?: string
          p_producto_codigo: string
        }
        Returns: undefined
      }
      repuestos_crear_version_modelo: {
        Args: {
          p_marca: string
          p_nombre: string
          p_parametros: Json
          p_segmentos?: Json
        }
        Returns: string
      }
      repuestos_diagnostico_fuentes_historial: { Args: never; Returns: Json }
      repuestos_ejecutar_sugerencia: {
        Args: { p_fecha_analisis?: string; p_marca: string; p_nombre?: string }
        Returns: string
      }
      repuestos_es_subgrupo_legacy_repuesto: {
        Args: { p_subgrupo: string }
        Returns: boolean
      }
      repuestos_estado_facturacion_historica: { Args: never; Returns: Json }
      repuestos_estado_maestro_legacy: { Args: never; Returns: Json }
      repuestos_excluir_ventas_duplicadas: { Args: never; Returns: number }
      repuestos_exportar_reporte_claas: { Args: never; Returns: Json }
      repuestos_exportar_stock_ventas_completo: { Args: never; Returns: Json }
      repuestos_finalizar_facturacion_historica: {
        Args: { p_carga_id: string }
        Returns: Json
      }
      repuestos_finalizar_maestro_legacy: {
        Args: { p_carga_id: string }
        Returns: Json
      }
      repuestos_finalizar_publicacion_historial: { Args: never; Returns: Json }
      repuestos_guardar_planificacion_articulo: {
        Args: {
          p_observaciones?: string
          p_origen?: string
          p_producto_codigo: string
          p_stock_minimo_estrategico?: number
        }
        Returns: undefined
      }
      repuestos_importar_criticidades: {
        Args: { p_items: Json; p_marca: string }
        Returns: Json
      }
      repuestos_importar_facturacion_historica_lote: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      repuestos_importar_maestro_legacy_lote: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: number
      }
      repuestos_iniciar_facturacion_historica: {
        Args: { p_archivo_nombre: string; p_filas_archivo: number }
        Returns: string
      }
      repuestos_iniciar_maestro_legacy: {
        Args: { p_archivo_nombre: string }
        Returns: string
      }
      repuestos_iniciar_publicacion_historial: { Args: never; Returns: Json }
      repuestos_marca_legacy_por_subgrupo: {
        Args: { p_subgrupo: string }
        Returns: Database["public"]["Enums"]["marca"]
      }
      repuestos_preparar_criticidades_automaticas: {
        Args: { p_marca: string }
        Returns: Json
      }
      repuestos_preparar_planificacion_neutral: {
        Args: { p_marca: string }
        Returns: undefined
      }
      repuestos_publicar_facturacion_historica: { Args: never; Returns: Json }
      repuestos_publicar_historial_lote: {
        Args: { p_desde: string; p_hasta_exclusiva: string }
        Returns: Json
      }
      repuestos_reconciliar_maestro_legacy_actual: {
        Args: never
        Returns: Json
      }
      repuestos_refrescar_historial_unificado: { Args: never; Returns: Json }
      repuestos_resumen_calidad_historial: {
        Args: { p_marca?: string }
        Returns: Json
      }
      repuestos_sucursal_legacy: {
        Args: { p_valor: string }
        Returns: Database["public"]["Enums"]["sucursal"]
      }
      repuestos_sugerencia_viva: {
        Args: {
          p_buscar?: string
          p_estado?: string
          p_fecha_analisis: string
          p_limite?: number
          p_marca: string
          p_offset?: number
          p_segmento?: string
          p_solo_sugeridos?: boolean
        }
        Returns: Json
      }
      repuestos_sugerencia_viva_base_v1: {
        Args: {
          p_buscar?: string
          p_estado?: string
          p_fecha_analisis: string
          p_limite?: number
          p_marca: string
          p_offset?: number
          p_segmento?: string
          p_solo_sugeridos?: boolean
        }
        Returns: Json
      }
      repuestos_sugerencia_viva_base_v2: {
        Args: {
          p_buscar?: string
          p_estado?: string
          p_fecha_analisis: string
          p_limite?: number
          p_marca: string
          p_offset?: number
          p_segmento?: string
          p_solo_sugeridos?: boolean
        }
        Returns: Json
      }
      repuestos_sugerencia_viva_base_v4: {
        Args: {
          p_buscar?: string
          p_estado?: string
          p_fecha_analisis: string
          p_limite?: number
          p_marca: string
          p_offset?: number
          p_segmento?: string
          p_solo_sugeridos?: boolean
        }
        Returns: Json
      }
      repuestos_vincular_codigo_legacy: {
        Args: { p_codigo_legacy: string; p_producto_codigo: string }
        Returns: Json
      }
      servicios_es_tecnico_activo: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      servicios_listar_tecnicos_activos: {
        Args: never
        Returns: {
          id: string
          nombre: string
          sucursal: Database["public"]["Enums"]["sucursal"]
        }[]
      }
      valor_json_insensible: {
        Args: { p_claves: string[]; p_datos: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "jefatura" | "operativo" | "gerencia" | "superadmin"
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
      tipo_importacion: "parque" | "facturacion" | "repuestos"
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
      app_role: ["admin", "jefatura", "operativo", "gerencia", "superadmin"],
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
      tipo_importacion: ["parque", "facturacion", "repuestos"],
      tipo_trabajo: ["Visita de campo", "Máquina en taller"],
    },
  },
} as const
