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
      app_configuracion: {
        Row: {
          actualizado_en: string
          clave: string
          descripcion: string | null
          valor_numero: number
        }
        Insert: {
          actualizado_en?: string
          clave: string
          descripcion?: string | null
          valor_numero: number
        }
        Update: {
          actualizado_en?: string
          clave?: string
          descripcion?: string | null
          valor_numero?: number
        }
        Relationships: []
      }
      app_secciones: {
        Row: {
          activo: boolean
          creado_en: string
          id: string
          modulo_id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id: string
          modulo_id: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id?: string
          modulo_id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "app_secciones_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
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
      facturacion_dedupe_repair_backup: {
        Row: {
          repair_key: string
          respaldado_en: string
          row_data: Json
          row_id: string
          tabla: string
        }
        Insert: {
          repair_key: string
          respaldado_en?: string
          row_data: Json
          row_id: string
          tabla: string
        }
        Update: {
          repair_key?: string
          respaldado_en?: string
          row_data?: Json
          row_id?: string
          tabla?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_dedupe_repair_backup_repair_key_fkey"
            columns: ["repair_key"]
            isOneToOne: false
            referencedRelation: "facturacion_dedupe_repair_runs"
            referencedColumns: ["repair_key"]
          },
        ]
      }
      facturacion_dedupe_repair_pairs: {
        Row: {
          canonica_actualizado_en: string
          clave_comercial: string
          descartada_actualizado_en: string
          linea_canonica_id: string
          linea_descartada_id: string
          repair_key: string
        }
        Insert: {
          canonica_actualizado_en: string
          clave_comercial: string
          descartada_actualizado_en: string
          linea_canonica_id: string
          linea_descartada_id: string
          repair_key: string
        }
        Update: {
          canonica_actualizado_en?: string
          clave_comercial?: string
          descartada_actualizado_en?: string
          linea_canonica_id?: string
          linea_descartada_id?: string
          repair_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_dedupe_repair_pairs_linea_canonica_id_fkey"
            columns: ["linea_canonica_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_dedupe_repair_pairs_linea_canonica_id_fkey"
            columns: ["linea_canonica_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "facturacion_dedupe_repair_pairs_linea_descartada_id_fkey"
            columns: ["linea_descartada_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_dedupe_repair_pairs_linea_descartada_id_fkey"
            columns: ["linea_descartada_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "facturacion_dedupe_repair_pairs_repair_key_fkey"
            columns: ["repair_key"]
            isOneToOne: false
            referencedRelation: "facturacion_dedupe_repair_runs"
            referencedColumns: ["repair_key"]
          },
        ]
      }
      facturacion_dedupe_repair_runs: {
        Row: {
          aplicado_en: string | null
          creado_en: string
          detalles: Json
          estado: string
          repair_key: string
          revertido_en: string | null
        }
        Insert: {
          aplicado_en?: string | null
          creado_en?: string
          detalles?: Json
          estado: string
          repair_key: string
          revertido_en?: string | null
        }
        Update: {
          aplicado_en?: string | null
          creado_en?: string
          detalles?: Json
          estado?: string
          repair_key?: string
          revertido_en?: string | null
        }
        Relationships: []
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
          tipo_tiempo: string | null
          total_venta: number
          valor_unitario: number | null
          vendedor: string | null
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
          tipo_tiempo?: string | null
          total_venta?: number
          valor_unitario?: number | null
          vendedor?: string | null
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
          tipo_tiempo?: string | null
          total_venta?: number
          valor_unitario?: number | null
          vendedor?: string | null
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
      facturacion_rescate_20261009_ejecuciones: {
        Row: {
          aplicado_en: string
          dependencias_respaldadas: number
          detalle_esperado: number
          estado: string
          rescate_key: string
          restaurado_en: string | null
          resumen_esperado: number
        }
        Insert: {
          aplicado_en?: string
          dependencias_respaldadas: number
          detalle_esperado: number
          estado: string
          rescate_key: string
          restaurado_en?: string | null
          resumen_esperado: number
        }
        Update: {
          aplicado_en?: string
          dependencias_respaldadas?: number
          detalle_esperado?: number
          estado?: string
          rescate_key?: string
          restaurado_en?: string | null
          resumen_esperado?: number
        }
        Relationships: []
      }
      facturacion_rescate_20261009_filas: {
        Row: {
          clase: string
          fila: Json
          ordinal: number
          rescate_key: string
          respaldado_en: string
          tabla_esquema: string
          tabla_nombre: string
        }
        Insert: {
          clase: string
          fila: Json
          ordinal: number
          rescate_key: string
          respaldado_en?: string
          tabla_esquema: string
          tabla_nombre: string
        }
        Update: {
          clase?: string
          fila?: Json
          ordinal?: number
          rescate_key?: string
          respaldado_en?: string
          tabla_esquema?: string
          tabla_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_rescate_20261009_filas_rescate_key_fkey"
            columns: ["rescate_key"]
            isOneToOne: false
            referencedRelation: "facturacion_rescate_20261009_ejecuciones"
            referencedColumns: ["rescate_key"]
          },
        ]
      }
      facturacion_totvs_carga_lineas: {
        Row: {
          documento_fuente_sha256: string
          importacion_id: string
          linea_id: string
        }
        Insert: {
          documento_fuente_sha256: string
          importacion_id: string
          linea_id: string
        }
        Update: {
          documento_fuente_sha256?: string
          importacion_id?: string
          linea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_carga_lineas_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_carga_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_carga_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_correcciones_cientificas_20261013_v2: {
        Row: {
          actualizado_en_original: string
          candidatas_antes: Json
          cargas_antes: Json
          ejecutado_por: string
          evidencia_fuente: Json
          fingerprint_antes: string
          fingerprint_despues: string | null
          identidad: string
          importacion_original_id: string
          linea_antes: Json
          linea_despues: Json | null
          linea_hash_original: string
          linea_id: string
          pares_antes: Json
          repair_key: string
          reparado_en: string
          resolucion_dedupe: Json
          resumen_antes: Json
          resumen_despues: Json | null
          resumen_id: string
          revertido_en: string | null
          revertido_por: string | null
        }
        Insert: {
          actualizado_en_original: string
          candidatas_antes: Json
          cargas_antes: Json
          ejecutado_por?: string
          evidencia_fuente: Json
          fingerprint_antes: string
          fingerprint_despues?: string | null
          identidad: string
          importacion_original_id: string
          linea_antes: Json
          linea_despues?: Json | null
          linea_hash_original: string
          linea_id: string
          pares_antes: Json
          repair_key: string
          reparado_en?: string
          resolucion_dedupe: Json
          resumen_antes: Json
          resumen_despues?: Json | null
          resumen_id: string
          revertido_en?: string | null
          revertido_por?: string | null
        }
        Update: {
          actualizado_en_original?: string
          candidatas_antes?: Json
          cargas_antes?: Json
          ejecutado_por?: string
          evidencia_fuente?: Json
          fingerprint_antes?: string
          fingerprint_despues?: string | null
          identidad?: string
          importacion_original_id?: string
          linea_antes?: Json
          linea_despues?: Json | null
          linea_hash_original?: string
          linea_id?: string
          pares_antes?: Json
          repair_key?: string
          reparado_en?: string
          resolucion_dedupe?: Json
          resumen_antes?: Json
          resumen_despues?: Json | null
          resumen_id?: string
          revertido_en?: string | null
          revertido_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_correcciones_cie_importacion_original_id_fkey"
            columns: ["importacion_original_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_correcciones_cientificas_202610_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_correcciones_cientificas_202610_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_descriptor_preservaciones: {
        Row: {
          creado_en: string
          descriptores: string[]
          entrada_efectiva: Json
          entrada_recibida: Json
          id: string
          identidad: string
          importacion_id: string
          linea_id: string
        }
        Insert: {
          creado_en?: string
          descriptores: string[]
          entrada_efectiva: Json
          entrada_recibida: Json
          id?: string
          identidad: string
          importacion_id: string
          linea_id: string
        }
        Update: {
          creado_en?: string
          descriptores?: string[]
          entrada_efectiva?: Json
          entrada_recibida?: Json
          id?: string
          identidad?: string
          importacion_id?: string
          linea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_descriptor_preservaciones_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_descriptor_preservaciones_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_descriptor_preservaciones_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_grupo_descriptivo_cambios: {
        Row: {
          accion: string
          actualizado_en_anterior: string
          actualizado_en_nuevo: string
          codigo_producto: string
          creado_en: string
          entrada_recibida: Json
          grupo_anterior: string | null
          grupo_nuevo: string
          id: string
          identidad: string
          importacion_id: string
          linea_id: string
          raw_anterior: Json
          raw_nuevo: Json
          subgrupo_anterior: string | null
          subgrupo_nuevo: string
        }
        Insert: {
          accion: string
          actualizado_en_anterior: string
          actualizado_en_nuevo: string
          codigo_producto: string
          creado_en?: string
          entrada_recibida: Json
          grupo_anterior?: string | null
          grupo_nuevo: string
          id?: string
          identidad: string
          importacion_id: string
          linea_id: string
          raw_anterior: Json
          raw_nuevo: Json
          subgrupo_anterior?: string | null
          subgrupo_nuevo: string
        }
        Update: {
          accion?: string
          actualizado_en_anterior?: string
          actualizado_en_nuevo?: string
          codigo_producto?: string
          creado_en?: string
          entrada_recibida?: Json
          grupo_anterior?: string | null
          grupo_nuevo?: string
          id?: string
          identidad?: string
          importacion_id?: string
          linea_id?: string
          raw_anterior?: Json
          raw_nuevo?: Json
          subgrupo_anterior?: string | null
          subgrupo_nuevo?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_grupo_descriptivo_cambios_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_grupo_descriptivo_cambios_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_grupo_descriptivo_cambios_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_importador_versiones: {
        Row: {
          capturado_en: string
          definicion_rpc: string
          version: string
        }
        Insert: {
          capturado_en?: string
          definicion_rpc: string
          version: string
        }
        Update: {
          capturado_en?: string
          definicion_rpc?: string
          version?: string
        }
        Relationships: []
      }
      facturacion_totvs_preservaciones_auditadas: {
        Row: {
          creado_en: string
          identidad: string
          linea_actualizado_en: string
          linea_canonica_id: string
          linea_fingerprint: string
          marca_verificada: Database["public"]["Enums"]["marca"]
          motivo: string
          os_verificada: string
          tipo_tiempo_verificado: string | null
        }
        Insert: {
          creado_en?: string
          identidad: string
          linea_actualizado_en: string
          linea_canonica_id: string
          linea_fingerprint: string
          marca_verificada: Database["public"]["Enums"]["marca"]
          motivo: string
          os_verificada: string
          tipo_tiempo_verificado?: string | null
        }
        Update: {
          creado_en?: string
          identidad?: string
          linea_actualizado_en?: string
          linea_canonica_id?: string
          linea_fingerprint?: string
          marca_verificada?: Database["public"]["Enums"]["marca"]
          motivo?: string
          os_verificada?: string
          tipo_tiempo_verificado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_preservaciones_auditad_linea_canonica_id_fkey"
            columns: ["linea_canonica_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_preservaciones_auditad_linea_canonica_id_fkey"
            columns: ["linea_canonica_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_reimportacion_cambios: {
        Row: {
          cambios: Json
          creado_en: string
          fingerprint_anterior: string
          fingerprint_resultante: string | null
          id: string
          importacion_id: string
          linea_id: string
          raw_data_anterior: Json
        }
        Insert: {
          cambios: Json
          creado_en?: string
          fingerprint_anterior: string
          fingerprint_resultante?: string | null
          id?: string
          importacion_id: string
          linea_id: string
          raw_data_anterior: Json
        }
        Update: {
          cambios?: Json
          creado_en?: string
          fingerprint_anterior?: string
          fingerprint_resultante?: string | null
          id?: string
          importacion_id?: string
          linea_id?: string
          raw_data_anterior?: Json
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_reimportacion_cambios_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_reimportacion_cambios_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_reimportacion_cambios_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_tipo_tiempo_correcciones: {
        Row: {
          aplicado_en: string
          firma_after: Json | null
          firma_before: Json
          identidad: string
          linea_id: string
          raw_data_after: Json | null
          raw_data_before: Json
          repair_key: string
          revertido_en: string | null
          tipo_tiempo_after: string | null
          tipo_tiempo_before: string | null
        }
        Insert: {
          aplicado_en?: string
          firma_after?: Json | null
          firma_before: Json
          identidad: string
          linea_id: string
          raw_data_after?: Json | null
          raw_data_before: Json
          repair_key: string
          revertido_en?: string | null
          tipo_tiempo_after?: string | null
          tipo_tiempo_before?: string | null
        }
        Update: {
          aplicado_en?: string
          firma_after?: Json | null
          firma_before?: Json
          identidad?: string
          linea_id?: string
          raw_data_after?: Json | null
          raw_data_before?: Json
          repair_key?: string
          revertido_en?: string | null
          tipo_tiempo_after?: string | null
          tipo_tiempo_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_totvs_tipo_tiempo_correcciones_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "facturacion_lineas_importadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_totvs_tipo_tiempo_correcciones_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "v_repuestos_ventas_unificadas"
            referencedColumns: ["linea_id"]
          },
        ]
      }
      facturacion_totvs_vinculos_retirados_auditoria: {
        Row: {
          documento_fuente_sha256: string
          importacion_id: string
          linea_id: string
          motivo: string
          retirado_en: string
        }
        Insert: {
          documento_fuente_sha256: string
          importacion_id: string
          linea_id: string
          motivo: string
          retirado_en?: string
        }
        Update: {
          documento_fuente_sha256?: string
          importacion_id?: string
          linea_id?: string
          motivo?: string
          retirado_en?: string
        }
        Relationships: []
      }
      fleet_odometer_readings: {
        Row: {
          correction_of: string | null
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          odometer_km: number
          reading_date: string
          reading_kind: string
          vehicle_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_name: string | null
        }
        Insert: {
          correction_of?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          id?: string
          odometer_km: number
          reading_date: string
          reading_kind: string
          vehicle_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Update: {
          correction_of?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          id?: string
          odometer_km?: number
          reading_date?: string
          reading_kind?: string
          vehicle_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_odometer_readings_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "fleet_odometer_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_odometer_readings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicle_responsibility_events: {
        Row: {
          effective_date: string | null
          id: string
          recorded_at: string
          recorded_by: string
          recorded_by_name: string
          responsible_name_snapshot: string | null
          responsible_profile_id: string | null
          vehicle_id: string
        }
        Insert: {
          effective_date?: string | null
          id?: string
          recorded_at?: string
          recorded_by: string
          recorded_by_name: string
          responsible_name_snapshot?: string | null
          responsible_profile_id?: string | null
          vehicle_id: string
        }
        Update: {
          effective_date?: string | null
          id?: string
          recorded_at?: string
          recorded_by?: string
          recorded_by_name?: string
          responsible_name_snapshot?: string | null
          responsible_profile_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicle_responsibility_events_responsible_profile_id_fkey"
            columns: ["responsible_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicle_responsibility_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          active: boolean
          brand: string
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          image_license: string | null
          image_source_url: string | null
          image_url: string | null
          model: string | null
          model_year: number | null
          plate: string
          plate_normalized: string
        }
        Insert: {
          active?: boolean
          brand: string
          created_at?: string
          created_by: string
          created_by_name: string
          id?: string
          image_license?: string | null
          image_source_url?: string | null
          image_url?: string | null
          model?: string | null
          model_year?: number | null
          plate: string
          plate_normalized: string
        }
        Update: {
          active?: boolean
          brand?: string
          created_at?: string
          created_by?: string
          created_by_name?: string
          id?: string
          image_license?: string | null
          image_source_url?: string | null
          image_url?: string | null
          model?: string | null
          model_year?: number | null
          plate?: string
          plate_normalized?: string
        }
        Relationships: []
      }
      importaciones: {
        Row: {
          archivo_identidad_acreditada_en: string | null
          archivo_identidad_acreditada_por: string | null
          archivo_identidad_origen: string | null
          archivo_manifest_sha256: string | null
          archivo_nombre: string | null
          archivo_sha256: string | null
          archivo_tamano: number | null
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
          archivo_identidad_acreditada_en?: string | null
          archivo_identidad_acreditada_por?: string | null
          archivo_identidad_origen?: string | null
          archivo_manifest_sha256?: string | null
          archivo_nombre?: string | null
          archivo_sha256?: string | null
          archivo_tamano?: number | null
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
          archivo_identidad_acreditada_en?: string | null
          archivo_identidad_acreditada_por?: string | null
          archivo_identidad_origen?: string | null
          archivo_manifest_sha256?: string | null
          archivo_nombre?: string | null
          archivo_sha256?: string | null
          archivo_tamano?: number | null
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
          importacion_linea_id: string | null
          mime_type: string | null
          operacion_id: string | null
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
          importacion_linea_id?: string | null
          mime_type?: string | null
          operacion_id?: string | null
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
          importacion_linea_id?: string | null
          mime_type?: string | null
          operacion_id?: string | null
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
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_facturas_importacion_detalle"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_unidades_asignables"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_unidades_historicas"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_unidades_operativas"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importaciones_lineas_operativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
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
      maquinaria_documentos_factura_importacion_unidades: {
        Row: {
          creado_en: string
          documento_id: string
          importacion_unidad_id: string
        }
        Insert: {
          creado_en?: string
          documento_id: string
          importacion_unidad_id: string
        }
        Update: {
          creado_en?: string
          documento_id?: string
          importacion_unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_documentos_factura_import_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_facturas_importacion_detalle"
            referencedColumns: ["importacion_unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_factura_import_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_factura_import_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades_asignables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_factura_import_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades_historicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_factura_import_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades_operativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_documentos_factura_importacion_uni_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_factura_importacion_unidades: {
        Row: {
          actualizado_en: string
          chasis: string | null
          costo_unidad: number | null
          creado_en: string
          factura_id: string
          importacion_unidad_id: string
        }
        Insert: {
          actualizado_en?: string
          chasis?: string | null
          costo_unidad?: number | null
          creado_en?: string
          factura_id: string
          importacion_unidad_id: string
        }
        Update: {
          actualizado_en?: string
          chasis?: string | null
          costo_unidad?: number | null
          creado_en?: string
          factura_id?: string
          importacion_unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_factura_importacion_unida_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_facturas_importacion_detalle"
            referencedColumns: ["importacion_unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_factura_importacion_unida_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_factura_importacion_unida_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades_asignables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_factura_importacion_unida_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades_historicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_factura_importacion_unida_importacion_unidad_id_fkey"
            columns: ["importacion_unidad_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_importacion_unidades_operativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_factura_importacion_unidades_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_facturas_importacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_factura_importacion_unidades_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_facturas_importacion_detalle"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      maquinaria_facturas_importacion: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string | null
          documento_id: string | null
          factura_fecha: string | null
          factura_numero: string
          id: string
          moneda: string | null
          operacion_id: string
          proveedor: string | null
          valor_total: number | null
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          documento_id?: string | null
          factura_fecha?: string | null
          factura_numero: string
          id?: string
          moneda?: string | null
          operacion_id: string
          proveedor?: string | null
          valor_total?: number | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          documento_id?: string | null
          factura_fecha?: string | null
          factura_numero?: string
          id?: string
          moneda?: string | null
          operacion_id?: string
          proveedor?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_facturas_importacion_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
        ]
      }
      maquinaria_facturas_venta_unidades: {
        Row: {
          creado_en: string
          creado_por: string | null
          documento_id: string
          estado_unidad_anterior: string
          unidad_operacion_id: string
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          documento_id: string
          estado_unidad_anterior: string
          unidad_operacion_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          documento_id?: string
          estado_unidad_anterior?: string
          unidad_operacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_facturas_venta_unidades_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_venta_unidades_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_venta_unidades_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_venta_unidades_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_venta_unidades_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: true
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_importacion_lineas: {
        Row: {
          actualizado_en: string
          alcance_valor_oc: string
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
          fecha_pedido: string | null
          flete_seguro: number | null
          id: string
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          marca_importacion: Database["public"]["Enums"]["marca"] | null
          marca_nombre: string | null
          margen_porcentaje: number | null
          modelo: string | null
          modelo_catalogo_id: string | null
          moneda_oc: string
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
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"] | null
          tipo_cambio: number | null
          transporte: string | null
          unidad_id: string | null
          utilidad: number | null
          valor_oc_general: number | null
          valor_venta: number | null
          venta_facturada: string | null
          vinculo_manual: boolean
        }
        Insert: {
          actualizado_en?: string
          alcance_valor_oc?: string
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
          fecha_pedido?: string | null
          flete_seguro?: number | null
          id?: string
          invoice_supplier?: string | null
          linea_id?: string | null
          llave_interna?: string | null
          marca_importacion?: Database["public"]["Enums"]["marca"] | null
          marca_nombre?: string | null
          margen_porcentaje?: number | null
          modelo?: string | null
          modelo_catalogo_id?: string | null
          moneda_oc?: string
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
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"] | null
          tipo_cambio?: number | null
          transporte?: string | null
          unidad_id?: string | null
          utilidad?: number | null
          valor_oc_general?: number | null
          valor_venta?: number | null
          venta_facturada?: string | null
          vinculo_manual?: boolean
        }
        Update: {
          actualizado_en?: string
          alcance_valor_oc?: string
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
          fecha_pedido?: string | null
          flete_seguro?: number | null
          id?: string
          invoice_supplier?: string | null
          linea_id?: string | null
          llave_interna?: string | null
          marca_importacion?: Database["public"]["Enums"]["marca"] | null
          marca_nombre?: string | null
          margen_porcentaje?: number | null
          modelo?: string | null
          modelo_catalogo_id?: string | null
          moneda_oc?: string
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
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"] | null
          tipo_cambio?: number | null
          transporte?: string | null
          unidad_id?: string | null
          utilidad?: number | null
          valor_oc_general?: number | null
          valor_venta?: number | null
          venta_facturada?: string | null
          vinculo_manual?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_lineas_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
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
            foreignKeyName: "maquinaria_importacion_lineas_modelo_catalogo_id_fkey"
            columns: ["modelo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "parque_modelos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
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
            referencedColumns: ["unidad_vinculada_id"]
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
      maquinaria_importacion_unidades: {
        Row: {
          activa: boolean
          actualizado_en: string
          ata: string | null
          chasis: string | null
          costo_final: number | null
          costo_final_sin_iva: number | null
          costo_stock_moneda: string
          creado_en: string
          detalle_manual: boolean
          eliminada_manualmente: boolean
          estado_fuente: string | null
          eta: string | null
          eta_manual: boolean
          factura_proveedor_fecha: string | null
          factura_proveedor_moneda: string | null
          id: string
          importacion_linea_id: string
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          llave_manual: boolean
          moneda_oc: string
          numero_unidad: number
          operacion_id: string | null
          situacion_vinculo: string
          unidad_id: string | null
          valor_factura_proveedor: number | null
          valor_oc: number | null
          valor_oc_manual: boolean
          vinculo_manual: boolean
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          ata?: string | null
          chasis?: string | null
          costo_final?: number | null
          costo_final_sin_iva?: number | null
          costo_stock_moneda?: string
          creado_en?: string
          detalle_manual?: boolean
          eliminada_manualmente?: boolean
          estado_fuente?: string | null
          eta?: string | null
          eta_manual?: boolean
          factura_proveedor_fecha?: string | null
          factura_proveedor_moneda?: string | null
          id?: string
          importacion_linea_id: string
          invoice_supplier?: string | null
          linea_id?: string | null
          llave_interna?: string | null
          llave_manual?: boolean
          moneda_oc?: string
          numero_unidad: number
          operacion_id?: string | null
          situacion_vinculo?: string
          unidad_id?: string | null
          valor_factura_proveedor?: number | null
          valor_oc?: number | null
          valor_oc_manual?: boolean
          vinculo_manual?: boolean
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          ata?: string | null
          chasis?: string | null
          costo_final?: number | null
          costo_final_sin_iva?: number | null
          costo_stock_moneda?: string
          creado_en?: string
          detalle_manual?: boolean
          eliminada_manualmente?: boolean
          estado_fuente?: string | null
          eta?: string | null
          eta_manual?: boolean
          factura_proveedor_fecha?: string | null
          factura_proveedor_moneda?: string | null
          id?: string
          importacion_linea_id?: string
          invoice_supplier?: string | null
          linea_id?: string | null
          llave_interna?: string | null
          llave_manual?: boolean
          moneda_oc?: string
          numero_unidad?: number
          operacion_id?: string | null
          situacion_vinculo?: string
          unidad_id?: string | null
          valor_factura_proveedor?: number | null
          valor_oc?: number | null
          valor_oc_manual?: boolean
          vinculo_manual?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_facturas_importacion_detalle"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_unidades_asignables"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_unidades_historicas"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_unidades_operativas"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importaciones_lineas_operativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_importacion_linea_id_fkey"
            columns: ["importacion_linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["importacion_linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
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
      maquinaria_marcas_catalogo: {
        Row: {
          activa: boolean
          actualizado_en: string
          admitida_parque: boolean
          creado_en: string
          creado_por: string | null
          nombre: string
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          admitida_parque?: boolean
          creado_en?: string
          creado_por?: string | null
          nombre: string
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          admitida_parque?: boolean
          creado_en?: string
          creado_por?: string | null
          nombre?: string
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
          marca_nombre: string | null
          modelo: string | null
          modelo_catalogo_id: string | null
          moneda_acordada: string
          operacion_id: string
          producto: string | null
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
          valor_acordado_unitario: number | null
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
          marca_nombre?: string | null
          modelo?: string | null
          modelo_catalogo_id?: string | null
          moneda_acordada?: string
          operacion_id: string
          producto?: string | null
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
          valor_acordado_unitario?: number | null
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
          marca_nombre?: string | null
          modelo?: string | null
          modelo_catalogo_id?: string | null
          moneda_acordada?: string
          operacion_id?: string
          producto?: string | null
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
          valor_acordado_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_operacion_lineas_modelo_catalogo_id_fkey"
            columns: ["modelo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "parque_modelos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_operacion_lineas_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
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
      ordenes_servicio_importadas_archivo: {
        Row: {
          archivado_en: string
          archivado_por: string | null
          id: string
          importacion_reconciliadora_id: string | null
          motivo: string
          os_numero: string
          registro: Json
        }
        Insert: {
          archivado_en?: string
          archivado_por?: string | null
          id?: string
          importacion_reconciliadora_id?: string | null
          motivo: string
          os_numero: string
          registro: Json
        }
        Update: {
          archivado_en?: string
          archivado_por?: string | null
          id?: string
          importacion_reconciliadora_id?: string | null
          motivo?: string
          os_numero?: string
          registro?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_servicio_importadas_a_importacion_reconciliadora_i_fkey"
            columns: ["importacion_reconciliadora_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_importadas_archivo_archivado_por_fkey"
            columns: ["archivado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      os_exclusiones_confirmadas: {
        Row: {
          creada_en: string
          factura: string
          motivo: string
          os_numero: string
          reemplazada_por: string
        }
        Insert: {
          creada_en?: string
          factura: string
          motivo: string
          os_numero: string
          reemplazada_por: string
        }
        Update: {
          creada_en?: string
          factura?: string
          motivo?: string
          os_numero?: string
          reemplazada_por?: string
        }
        Relationships: []
      }
      os_exclusiones_evidencia: {
        Row: {
          id: string
          operacion: string
          os_numero: string
          registrada_en: string
          registro: Json
          tabla: string
        }
        Insert: {
          id?: string
          operacion: string
          os_numero: string
          registrada_en?: string
          registro: Json
          tabla: string
        }
        Update: {
          id?: string
          operacion?: string
          os_numero?: string
          registrada_en?: string
          registro?: Json
          tabla?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_exclusiones_evidencia_os_numero_fkey"
            columns: ["os_numero"]
            isOneToOne: false
            referencedRelation: "os_exclusiones_confirmadas"
            referencedColumns: ["os_numero"]
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
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
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
          marca_nombre: string | null
          modelo_catalogo_id: string | null
          modelo_tipo: string | null
          notas: string | null
          serie: string
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
          subgrupo_personalizado: string | null
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
          marca_nombre?: string | null
          modelo_catalogo_id?: string | null
          modelo_tipo?: string | null
          notas?: string | null
          serie: string
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
          subgrupo_personalizado?: string | null
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
          marca_nombre?: string | null
          modelo_catalogo_id?: string | null
          modelo_tipo?: string | null
          notas?: string | null
          serie?: string
          subgrupo?: Database["public"]["Enums"]["subgrupo_maquina"]
          subgrupo_personalizado?: string | null
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
          {
            foreignKeyName: "parque_maquinas_modelo_catalogo_id_fkey"
            columns: ["modelo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "parque_modelos_catalogo"
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
          revisado_manual: boolean
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Insert: {
          alias: string
          clave_alias: string
          creado_en?: string
          id?: string
          marca: Database["public"]["Enums"]["marca"]
          modelo_catalogo_id: string
          revisado_manual?: boolean
          subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Update: {
          alias?: string
          clave_alias?: string
          creado_en?: string
          id?: string
          marca?: Database["public"]["Enums"]["marca"]
          modelo_catalogo_id?: string
          revisado_manual?: boolean
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
          marca_nombre: string | null
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
          marca_nombre?: string | null
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
          marca_nombre?: string | null
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
          parque_origen_id: string | null
          producto_codigo: string
          saldo_actual: number
          source_row: number | null
          stock_key: string
          sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo: string | null
          unidad_operacion_id: string | null
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
          parque_origen_id?: string | null
          producto_codigo: string
          saldo_actual?: number
          source_row?: number | null
          stock_key: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo?: string | null
          unidad_operacion_id?: string | null
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
          parque_origen_id?: string | null
          producto_codigo?: string
          saldo_actual?: number
          source_row?: number | null
          stock_key?: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
          tipo?: string | null
          unidad_operacion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parque_stock_maquinas_parque_origen_id_fkey"
            columns: ["parque_origen_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["parque_maquina_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_parque_origen_id_fkey"
            columns: ["parque_origen_id"]
            isOneToOne: false
            referencedRelation: "parque_maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      parque_stock_proyectado_ajustes: {
        Row: {
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          marca: string
          modelo: string
          motivo: string
          pedidos_compra_delta: number
          referencia: string | null
          stock_delta: number
          tipo: string
          ventas_pendientes_delta: number
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          fecha: string
          id?: string
          marca: string
          modelo: string
          motivo: string
          pedidos_compra_delta?: number
          referencia?: string | null
          stock_delta?: number
          tipo: string
          ventas_pendientes_delta?: number
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          marca?: string
          modelo?: string
          motivo?: string
          pedidos_compra_delta?: number
          referencia?: string | null
          stock_delta?: number
          tipo?: string
          ventas_pendientes_delta?: number
        }
        Relationships: []
      }
      parque_stock_proyectado_apertura: {
        Row: {
          creado_en: string
          fecha_corte: string
          fuente: string
          id: string
          marca: string
          modelo: string
          modelo_clave: string | null
          pedidos_compra_inicial: number
          programa: string
          stock_inicial: number
          tipo: string
          ventas_pendientes_inicial: number
        }
        Insert: {
          creado_en?: string
          fecha_corte: string
          fuente: string
          id?: string
          marca: string
          modelo: string
          modelo_clave?: string | null
          pedidos_compra_inicial?: number
          programa: string
          stock_inicial?: number
          tipo: string
          ventas_pendientes_inicial?: number
        }
        Update: {
          creado_en?: string
          fecha_corte?: string
          fuente?: string
          id?: string
          marca?: string
          modelo?: string
          modelo_clave?: string | null
          pedidos_compra_inicial?: number
          programa?: string
          stock_inicial?: number
          tipo?: string
          ventas_pendientes_inicial?: number
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
      repuestos_compras_historicas: {
        Row: {
          archivo_nombre: string
          archivo_sha256: string
          cargado_en: string
          codigo_legacy_norm: string
          fila_origen: number
          ultima_compra: string
        }
        Insert: {
          archivo_nombre: string
          archivo_sha256: string
          cargado_en?: string
          codigo_legacy_norm: string
          fila_origen: number
          ultima_compra: string
        }
        Update: {
          archivo_nombre?: string
          archivo_sha256?: string
          cargado_en?: string
          codigo_legacy_norm?: string
          fila_origen?: number
          ultima_compra?: string
        }
        Relationships: []
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
          notas_credito_archivo: number | null
          notas_credito_verificadas_en: string | null
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
          notas_credito_archivo?: number | null
          notas_credito_verificadas_en?: string | null
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
          notas_credito_archivo?: number | null
          notas_credito_verificadas_en?: string | null
          productos_vinculados?: number
          publicacion_estado?: string | null
          publicacion_hasta?: string | null
          publicado_en?: string | null
        }
        Relationships: []
      }
      repuestos_ficha_grid_cargas: {
        Row: {
          activo: boolean
          archivo_nombre: string
          archivo_sha256: string
          cargado_en: string
          codigos_esperados: number
          compras_esperadas: number
          contenido_md5: string
          fecha_corte: string
          movimientos: number
        }
        Insert: {
          activo?: boolean
          archivo_nombre: string
          archivo_sha256: string
          cargado_en?: string
          codigos_esperados: number
          compras_esperadas: number
          contenido_md5: string
          fecha_corte: string
          movimientos: number
        }
        Update: {
          activo?: boolean
          archivo_nombre?: string
          archivo_sha256?: string
          cargado_en?: string
          codigos_esperados?: number
          compras_esperadas?: number
          contenido_md5?: string
          fecha_corte?: string
          movimientos?: number
        }
        Relationships: []
      }
      repuestos_ficha_grid_compras: {
        Row: {
          archivo_sha256: string
          cantidad: number | null
          codigo_legacy_norm: string
          codigo_movimiento: string | null
          fila_origen: number | null
          tipo_movimiento: string | null
          ultima_compra: string | null
        }
        Insert: {
          archivo_sha256: string
          cantidad?: number | null
          codigo_legacy_norm: string
          codigo_movimiento?: string | null
          fila_origen?: number | null
          tipo_movimiento?: string | null
          ultima_compra?: string | null
        }
        Update: {
          archivo_sha256?: string
          cantidad?: number | null
          codigo_legacy_norm?: string
          codigo_movimiento?: string | null
          fila_origen?: number | null
          tipo_movimiento?: string | null
          ultima_compra?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repuestos_ficha_grid_compras_archivo_sha256_fkey"
            columns: ["archivo_sha256"]
            isOneToOne: false
            referencedRelation: "repuestos_ficha_grid_cargas"
            referencedColumns: ["archivo_sha256"]
          },
        ]
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
          saldo_legacy: number | null
          situacion: string | null
          tipo: string | null
          ultima_compra: string | null
          ultima_venta: string | null
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
          saldo_legacy?: number | null
          situacion?: string | null
          tipo?: string | null
          ultima_compra?: string | null
          ultima_venta?: string | null
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
          saldo_legacy?: number | null
          situacion?: string | null
          tipo?: string | null
          ultima_compra?: string | null
          ultima_venta?: string | null
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
      totvs_absorcion_reglas: {
        Row: {
          categoria: string
          centro_costo: string
          cuenta_codigo: string
          fundamento: string
          id: number
          regla_importe: string
          version: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          categoria: string
          centro_costo: string
          cuenta_codigo: string
          fundamento: string
          id?: number
          regla_importe: string
          version?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          categoria?: string
          centro_costo?: string
          cuenta_codigo?: string
          fundamento?: string
          id?: number
          regla_importe?: string
          version?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      totvs_consolidacion_actual: {
        Row: {
          actualizado_en: string
          observacion_id: string
          periodo: string
        }
        Insert: {
          actualizado_en?: string
          observacion_id: string
          periodo: string
        }
        Update: {
          actualizado_en?: string
          observacion_id?: string
          periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "totvs_consolidacion_actual_observacion_id_fkey"
            columns: ["observacion_id"]
            isOneToOne: true
            referencedRelation: "totvs_consolidacion_observaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_consolidacion_cola: {
        Row: {
          creada_en: string
          estado: string
          evento: string
          facturacion_carga_id: string | null
          id: number
          intentos: number
          mayor_carga_id: string | null
          procesada_en: string | null
          revision: number
          ultimo_error: string | null
        }
        Insert: {
          creada_en?: string
          estado?: string
          evento: string
          facturacion_carga_id?: string | null
          id?: never
          intentos?: number
          mayor_carga_id?: string | null
          procesada_en?: string | null
          revision: number
          ultimo_error?: string | null
        }
        Update: {
          creada_en?: string
          estado?: string
          evento?: string
          facturacion_carga_id?: string | null
          id?: never
          intentos?: number
          mayor_carga_id?: string | null
          procesada_en?: string | null
          revision?: number
          ultimo_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totvs_consolidacion_cola_facturacion_carga_id_fkey"
            columns: ["facturacion_carga_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_consolidacion_cola_mayor_carga_id_fkey"
            columns: ["mayor_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_consolidacion_componentes_cero: {
        Row: {
          componente: string
          fuente_referencia: string
          fundamento: string
          periodo: string
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          componente: string
          fuente_referencia: string
          fundamento: string
          periodo: string
          registrado_en?: string
          registrado_por: string
        }
        Update: {
          componente?: string
          fuente_referencia?: string
          fundamento?: string
          periodo?: string
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: []
      }
      totvs_consolidacion_evidencia_negocio: {
        Row: {
          creada_en: string
          fundamento: string
          periodo: string
          tipo: string
        }
        Insert: {
          creada_en?: string
          fundamento: string
          periodo: string
          tipo: string
        }
        Update: {
          creada_en?: string
          fundamento?: string
          periodo?: string
          tipo?: string
        }
        Relationships: []
      }
      totvs_consolidacion_observaciones: {
        Row: {
          bloque_componentes: boolean
          bloque_conciliacion: boolean
          bloque_fuente: boolean
          causas: Json
          corrida_id: string
          criterio_version: string
          dependencia_revision: number
          estado: string
          evento: string
          facturacion_carga_id: string | null
          facturacion_sha256: string | null
          id: string
          mayor_carga_id: string | null
          mayor_sha256: string | null
          metricas: Json
          observada_en: string
          periodo: string
        }
        Insert: {
          bloque_componentes: boolean
          bloque_conciliacion: boolean
          bloque_fuente: boolean
          causas: Json
          corrida_id: string
          criterio_version: string
          dependencia_revision: number
          estado: string
          evento: string
          facturacion_carga_id?: string | null
          facturacion_sha256?: string | null
          id?: string
          mayor_carga_id?: string | null
          mayor_sha256?: string | null
          metricas: Json
          observada_en?: string
          periodo: string
        }
        Update: {
          bloque_componentes?: boolean
          bloque_conciliacion?: boolean
          bloque_fuente?: boolean
          causas?: Json
          corrida_id?: string
          criterio_version?: string
          dependencia_revision?: number
          estado?: string
          evento?: string
          facturacion_carga_id?: string | null
          facturacion_sha256?: string | null
          id?: string
          mayor_carga_id?: string | null
          mayor_sha256?: string | null
          metricas?: Json
          observada_en?: string
          periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "totvs_consolidacion_observaciones_facturacion_carga_id_fkey"
            columns: ["facturacion_carga_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_consolidacion_observaciones_mayor_carga_id_fkey"
            columns: ["mayor_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_consolidacion_revision: {
        Row: {
          actualizada_en: string
          revision: number
          singleton: boolean
        }
        Insert: {
          actualizada_en?: string
          revision?: number
          singleton?: boolean
        }
        Update: {
          actualizada_en?: string
          revision?: number
          singleton?: boolean
        }
        Relationships: []
      }
      totvs_cxc_carga_documentos: {
        Row: {
          carga_id: string
          documento_id: string
        }
        Insert: {
          carga_id: string
          documento_id: string
        }
        Update: {
          carga_id?: string
          documento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "totvs_cxc_carga_documentos_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_cxc_carga_documentos_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_resumen_agregado"
            referencedColumns: ["carga_id"]
          },
          {
            foreignKeyName: "totvs_cxc_carga_documentos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_cxc_cargas: {
        Row: {
          anticipos_cliente: number
          anticipos_cliente_saldo_cero: number
          anticipos_cliente_saldo_negativo: number
          anticipos_cliente_saldo_positivo: number
          anticipos_cliente_vinculados: number
          archivo_nombre: string
          archivo_sha256: string
          archivo_tamano: number
          cancelado_en: string | null
          cobertura_aplicacion_anticipos: string
          completado_en: string | null
          corte_evidencia: string
          creado_en: string
          creado_por: string
          estado: string
          facturas_elegibles: number
          facturas_futuras: number
          facturas_vence_hoy: number
          facturas_vencidas: number
          fecha_corte: string
          filas_documento: number
          filas_saldo_cero: number
          filas_saldo_negativo: number
          filas_saldo_positivo: number
          id: string
          positivos_no_factura: number
          reemplaza_carga_id: string | null
          saldo_anticipos_cliente_usd: number
          saldo_anticipos_negativo_usd: number
          saldo_anticipos_positivo_usd: number
          saldo_futuro_usd: number
          saldo_negativo: number
          saldo_neto_fuente: number
          saldo_pendiente_elegible_usd: number
          saldo_positivo: number
          saldo_positivo_no_factura_usd: number
          saldo_vence_hoy_usd: number
          saldo_vencido_usd: number
          snapshot_version: number
          valor_bruto: number
        }
        Insert: {
          anticipos_cliente?: number
          anticipos_cliente_saldo_cero?: number
          anticipos_cliente_saldo_negativo?: number
          anticipos_cliente_saldo_positivo?: number
          anticipos_cliente_vinculados?: number
          archivo_nombre: string
          archivo_sha256: string
          archivo_tamano: number
          cancelado_en?: string | null
          cobertura_aplicacion_anticipos?: string
          completado_en?: string | null
          corte_evidencia: string
          creado_en?: string
          creado_por: string
          estado?: string
          facturas_elegibles?: number
          facturas_futuras?: number
          facturas_vence_hoy?: number
          facturas_vencidas?: number
          fecha_corte: string
          filas_documento?: number
          filas_saldo_cero?: number
          filas_saldo_negativo?: number
          filas_saldo_positivo?: number
          id?: string
          positivos_no_factura?: number
          reemplaza_carga_id?: string | null
          saldo_anticipos_cliente_usd?: number
          saldo_anticipos_negativo_usd?: number
          saldo_anticipos_positivo_usd?: number
          saldo_futuro_usd?: number
          saldo_negativo?: number
          saldo_neto_fuente?: number
          saldo_pendiente_elegible_usd?: number
          saldo_positivo?: number
          saldo_positivo_no_factura_usd?: number
          saldo_vence_hoy_usd?: number
          saldo_vencido_usd?: number
          snapshot_version: number
          valor_bruto?: number
        }
        Update: {
          anticipos_cliente?: number
          anticipos_cliente_saldo_cero?: number
          anticipos_cliente_saldo_negativo?: number
          anticipos_cliente_saldo_positivo?: number
          anticipos_cliente_vinculados?: number
          archivo_nombre?: string
          archivo_sha256?: string
          archivo_tamano?: number
          cancelado_en?: string | null
          cobertura_aplicacion_anticipos?: string
          completado_en?: string | null
          corte_evidencia?: string
          creado_en?: string
          creado_por?: string
          estado?: string
          facturas_elegibles?: number
          facturas_futuras?: number
          facturas_vence_hoy?: number
          facturas_vencidas?: number
          fecha_corte?: string
          filas_documento?: number
          filas_saldo_cero?: number
          filas_saldo_negativo?: number
          filas_saldo_positivo?: number
          id?: string
          positivos_no_factura?: number
          reemplaza_carga_id?: string | null
          saldo_anticipos_cliente_usd?: number
          saldo_anticipos_negativo_usd?: number
          saldo_anticipos_positivo_usd?: number
          saldo_futuro_usd?: number
          saldo_negativo?: number
          saldo_neto_fuente?: number
          saldo_pendiente_elegible_usd?: number
          saldo_positivo?: number
          saldo_positivo_no_factura_usd?: number
          saldo_vence_hoy_usd?: number
          saldo_vencido_usd?: number
          snapshot_version?: number
          valor_bruto?: number
        }
        Relationships: [
          {
            foreignKeyName: "totvs_cxc_cargas_reemplaza_carga_id_fkey"
            columns: ["reemplaza_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_cxc_cargas_reemplaza_carga_id_fkey"
            columns: ["reemplaza_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_resumen_agregado"
            referencedColumns: ["carga_id"]
          },
        ]
      }
      totvs_cxc_documentos: {
        Row: {
          archivo_origen: string
          asesor: string
          clave_origen: string
          cliente_codigo: string
          cliente_nombre: string
          condicion: string
          creado_en: string
          cuota: string | null
          datos_fuente: Json
          documento: string
          elegible_kpi: boolean
          fecha_corte: string
          fecha_emision: string
          fecha_vencimiento: string
          fecha_vencimiento_original: string | null
          fila_origen: number
          huella_origen: string
          id: string
          modalidad: string
          moneda: string
          moneda_codigo: string
          naturaleza_documento: string
          primera_carga_id: string
          saldo_pendiente: number
          serie: string
          snapshot_sha256: string
          sucursal: string
          tasa_moneda: number
          tipo_documento: string
          valor_original: number
        }
        Insert: {
          archivo_origen: string
          asesor: string
          clave_origen: string
          cliente_codigo: string
          cliente_nombre: string
          condicion: string
          creado_en?: string
          cuota?: string | null
          datos_fuente?: Json
          documento: string
          elegible_kpi: boolean
          fecha_corte: string
          fecha_emision: string
          fecha_vencimiento: string
          fecha_vencimiento_original?: string | null
          fila_origen: number
          huella_origen: string
          id?: string
          modalidad: string
          moneda: string
          moneda_codigo: string
          naturaleza_documento: string
          primera_carga_id: string
          saldo_pendiente: number
          serie: string
          snapshot_sha256: string
          sucursal: string
          tasa_moneda: number
          tipo_documento: string
          valor_original: number
        }
        Update: {
          archivo_origen?: string
          asesor?: string
          clave_origen?: string
          cliente_codigo?: string
          cliente_nombre?: string
          condicion?: string
          creado_en?: string
          cuota?: string | null
          datos_fuente?: Json
          documento?: string
          elegible_kpi?: boolean
          fecha_corte?: string
          fecha_emision?: string
          fecha_vencimiento?: string
          fecha_vencimiento_original?: string | null
          fila_origen?: number
          huella_origen?: string
          id?: string
          modalidad?: string
          moneda?: string
          moneda_codigo?: string
          naturaleza_documento?: string
          primera_carga_id?: string
          saldo_pendiente?: number
          serie?: string
          snapshot_sha256?: string
          sucursal?: string
          tasa_moneda?: number
          tipo_documento?: string
          valor_original?: number
        }
        Relationships: [
          {
            foreignKeyName: "totvs_cxc_documentos_primera_carga_id_fkey"
            columns: ["primera_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_cxc_documentos_primera_carga_id_fkey"
            columns: ["primera_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_resumen_agregado"
            referencedColumns: ["carga_id"]
          },
        ]
      }
      totvs_facturas_compra_lineas: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          centro_costo: string | null
          creado_en: string
          cuenta_contable: string | null
          datos_fuente: Json
          documento: string
          documento_electronico: string | null
          especie: string
          fecha_digitacion: string
          fecha_emision: string
          fecha_vencimiento: string | null
          fila_origen: number
          filial: string
          huella_origen: string
          id: string
          item: string
          item_pedido_compra: string | null
          modalidad: string | null
          moneda_origen: string
          nro_reintegro: string | null
          observacion: string | null
          pedido_compra: string | null
          producto_codigo: string
          producto_descripcion: string | null
          proveedor_codigo: string
          proveedor_nombre: string | null
          proveedor_tienda: string
          reintegro: string | null
          serie: string
          timbrado: string | null
          tipo_cambio: number
          tipo_entrada: string | null
          total_gs: number
          total_usd: number
          usuario_alta: string | null
          valor_unitario_gs: number
          valor_unitario_usd: number
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          centro_costo?: string | null
          creado_en?: string
          cuenta_contable?: string | null
          datos_fuente?: Json
          documento: string
          documento_electronico?: string | null
          especie: string
          fecha_digitacion: string
          fecha_emision: string
          fecha_vencimiento?: string | null
          fila_origen: number
          filial: string
          huella_origen: string
          id?: string
          item: string
          item_pedido_compra?: string | null
          modalidad?: string | null
          moneda_origen: string
          nro_reintegro?: string | null
          observacion?: string | null
          pedido_compra?: string | null
          producto_codigo: string
          producto_descripcion?: string | null
          proveedor_codigo: string
          proveedor_nombre?: string | null
          proveedor_tienda: string
          reintegro?: string | null
          serie: string
          timbrado?: string | null
          tipo_cambio: number
          tipo_entrada?: string | null
          total_gs: number
          total_usd: number
          usuario_alta?: string | null
          valor_unitario_gs: number
          valor_unitario_usd: number
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          cantidad?: number
          carga_id?: string
          centro_costo?: string | null
          creado_en?: string
          cuenta_contable?: string | null
          datos_fuente?: Json
          documento?: string
          documento_electronico?: string | null
          especie?: string
          fecha_digitacion?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          fila_origen?: number
          filial?: string
          huella_origen?: string
          id?: string
          item?: string
          item_pedido_compra?: string | null
          modalidad?: string | null
          moneda_origen?: string
          nro_reintegro?: string | null
          observacion?: string | null
          pedido_compra?: string | null
          producto_codigo?: string
          producto_descripcion?: string | null
          proveedor_codigo?: string
          proveedor_nombre?: string | null
          proveedor_tienda?: string
          reintegro?: string | null
          serie?: string
          timbrado?: string | null
          tipo_cambio?: number
          tipo_entrada?: string | null
          total_gs?: number
          total_usd?: number
          usuario_alta?: string | null
          valor_unitario_gs?: number
          valor_unitario_usd?: number
        }
        Relationships: []
      }
      totvs_importaciones_despacho: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          condicion_pago: string | null
          creado_en: string
          datos_fuente: Json
          despachante: string | null
          fabricante_codigo: string | null
          fecha_documento: string | null
          fecha_finalizacion: string | null
          fecha_proceso: string
          fila_origen: number
          generada: string | null
          huella_origen: string
          id: string
          item_documento: string
          item_proceso: string
          moneda: string | null
          numero_documento: string
          precio_unitario: number
          proceso: string
          producto_codigo: string
          producto_descripcion: string | null
          proveedor_codigo: string | null
          proveedor_nombre: string | null
          referencia_orden_compra: string | null
          serie: string | null
          sucursal: string
          timbrado: string | null
          tipo_entrada: string | null
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          condicion_pago?: string | null
          creado_en?: string
          datos_fuente?: Json
          despachante?: string | null
          fabricante_codigo?: string | null
          fecha_documento?: string | null
          fecha_finalizacion?: string | null
          fecha_proceso: string
          fila_origen: number
          generada?: string | null
          huella_origen: string
          id?: string
          item_documento: string
          item_proceso: string
          moneda?: string | null
          numero_documento: string
          precio_unitario: number
          proceso: string
          producto_codigo: string
          producto_descripcion?: string | null
          proveedor_codigo?: string | null
          proveedor_nombre?: string | null
          referencia_orden_compra?: string | null
          serie?: string | null
          sucursal: string
          timbrado?: string | null
          tipo_entrada?: string | null
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          cantidad?: number
          carga_id?: string
          condicion_pago?: string | null
          creado_en?: string
          datos_fuente?: Json
          despachante?: string | null
          fabricante_codigo?: string | null
          fecha_documento?: string | null
          fecha_finalizacion?: string | null
          fecha_proceso?: string
          fila_origen?: number
          generada?: string | null
          huella_origen?: string
          id?: string
          item_documento?: string
          item_proceso?: string
          moneda?: string | null
          numero_documento?: string
          precio_unitario?: number
          proceso?: string
          producto_codigo?: string
          producto_descripcion?: string | null
          proveedor_codigo?: string | null
          proveedor_nombre?: string | null
          referencia_orden_compra?: string | null
          serie?: string | null
          sucursal?: string
          timbrado?: string | null
          tipo_entrada?: string | null
        }
        Relationships: []
      }
      totvs_kardex_movimientos: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          contraparte_codigo: string | null
          contraparte_tienda: string | null
          costo_total_gs: number
          costo_total_moneda_2: number
          costo_total_moneda_3: number
          costo_unitario_gs: number
          costo_unitario_moneda_2: number
          costo_unitario_moneda_3: number
          creado_en: string
          cuenta_contable: string | null
          datos_fuente: Json
          deposito: string
          deposito_descripcion: string | null
          direccion: string
          documento: string
          especie_documento: string
          fecha_movimiento: string
          fila_origen: number
          filial: string
          grupo_producto: string | null
          huella_origen: string
          id: string
          moneda_codigo: string
          movimiento_detalle: string | null
          producto_codigo: string
          producto_descripcion: string | null
          recno_origen: string
          secuencia: string
          serie: string | null
          tabla_origen: string
          tipo_cambio: number
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          contraparte_codigo?: string | null
          contraparte_tienda?: string | null
          costo_total_gs?: number
          costo_total_moneda_2?: number
          costo_total_moneda_3?: number
          costo_unitario_gs?: number
          costo_unitario_moneda_2?: number
          costo_unitario_moneda_3?: number
          creado_en?: string
          cuenta_contable?: string | null
          datos_fuente?: Json
          deposito: string
          deposito_descripcion?: string | null
          direccion: string
          documento: string
          especie_documento: string
          fecha_movimiento: string
          fila_origen: number
          filial: string
          grupo_producto?: string | null
          huella_origen: string
          id?: string
          moneda_codigo: string
          movimiento_detalle?: string | null
          producto_codigo: string
          producto_descripcion?: string | null
          recno_origen: string
          secuencia: string
          serie?: string | null
          tabla_origen: string
          tipo_cambio?: number
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          cantidad?: number
          carga_id?: string
          contraparte_codigo?: string | null
          contraparte_tienda?: string | null
          costo_total_gs?: number
          costo_total_moneda_2?: number
          costo_total_moneda_3?: number
          costo_unitario_gs?: number
          costo_unitario_moneda_2?: number
          costo_unitario_moneda_3?: number
          creado_en?: string
          cuenta_contable?: string | null
          datos_fuente?: Json
          deposito?: string
          deposito_descripcion?: string | null
          direccion?: string
          documento?: string
          especie_documento?: string
          fecha_movimiento?: string
          fila_origen?: number
          filial?: string
          grupo_producto?: string | null
          huella_origen?: string
          id?: string
          moneda_codigo?: string
          movimiento_detalle?: string | null
          producto_codigo?: string
          producto_descripcion?: string | null
          recno_origen?: string
          secuencia?: string
          serie?: string | null
          tabla_origen?: string
          tipo_cambio?: number
        }
        Relationships: []
      }
      totvs_kardex_sintetico: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          carga_id: string
          chasis: string | null
          chasis_clave: string | null
          creado_en: string
          datos_fuente: Json
          deposito: string
          fila_origen: number
          huella_origen: string
          id: string
          ppp_1: number
          ppp_2: number
          ppp_3: number
          producto_codigo: string
          producto_descripcion: string | null
          saldo: number
          sucursal: string
          valor_1: number
          valor_2: number
          valor_3: number
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          carga_id: string
          chasis?: string | null
          chasis_clave?: string | null
          creado_en?: string
          datos_fuente?: Json
          deposito: string
          fila_origen: number
          huella_origen: string
          id?: string
          ppp_1: number
          ppp_2: number
          ppp_3: number
          producto_codigo: string
          producto_descripcion?: string | null
          saldo: number
          sucursal: string
          valor_1: number
          valor_2: number
          valor_3: number
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          carga_id?: string
          chasis?: string | null
          chasis_clave?: string | null
          creado_en?: string
          datos_fuente?: Json
          deposito?: string
          fila_origen?: number
          huella_origen?: string
          id?: string
          ppp_1?: number
          ppp_2?: number
          ppp_3?: number
          producto_codigo?: string
          producto_descripcion?: string | null
          saldo?: number
          sucursal?: string
          valor_1?: number
          valor_2?: number
          valor_3?: number
        }
        Relationships: []
      }
      totvs_mayor_absorcion_evidencia_registros: {
        Row: {
          amount_usd: number
          document_class_code: string
          evidence_row_key: string
          evidencia_id: string
          invoice_document_sha256: string
          movimiento_id: string
          ordinal: number
          post_sales_eligible: boolean
          record_sha256: string
        }
        Insert: {
          amount_usd: number
          document_class_code: string
          evidence_row_key: string
          evidencia_id: string
          invoice_document_sha256: string
          movimiento_id: string
          ordinal: number
          post_sales_eligible: boolean
          record_sha256: string
        }
        Update: {
          amount_usd?: number
          document_class_code?: string
          evidence_row_key?: string
          evidencia_id?: string
          invoice_document_sha256?: string
          movimiento_id?: string
          ordinal?: number
          post_sales_eligible?: boolean
          record_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "totvs_mayor_absorcion_evidencia_registros_evidencia_id_fkey"
            columns: ["evidencia_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_absorcion_evidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_mayor_absorcion_evidencia_registros_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_mayor_absorcion_evidencias: {
        Row: {
          creado_en: string
          creado_por: string
          eligible_record_count: number
          evidence_set_sha256: string
          id: string
          ledger_load_id: string
          ledger_source_byte_size: number
          ledger_source_sha256: string
          matched_record_count: number
          opening_excluded: boolean
          post_sales_adjustment_usd: number
          row_type_filter: string
          schema_version: string
          supporting_load_id: string
          supporting_source_byte_size: number
          supporting_source_sha256: string
          validation_status: string
        }
        Insert: {
          creado_en?: string
          creado_por: string
          eligible_record_count: number
          evidence_set_sha256: string
          id?: string
          ledger_load_id: string
          ledger_source_byte_size: number
          ledger_source_sha256: string
          matched_record_count: number
          opening_excluded: boolean
          post_sales_adjustment_usd: number
          row_type_filter: string
          schema_version: string
          supporting_load_id: string
          supporting_source_byte_size: number
          supporting_source_sha256: string
          validation_status: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          eligible_record_count?: number
          evidence_set_sha256?: string
          id?: string
          ledger_load_id?: string
          ledger_source_byte_size?: number
          ledger_source_sha256?: string
          matched_record_count?: number
          opening_excluded?: boolean
          post_sales_adjustment_usd?: number
          row_type_filter?: string
          schema_version?: string
          supporting_load_id?: string
          supporting_source_byte_size?: number
          supporting_source_sha256?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "totvs_mayor_absorcion_evidencias_ledger_load_id_fkey"
            columns: ["ledger_load_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_mayor_absorcion_evidencias_supporting_load_id_fkey"
            columns: ["supporting_load_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_mayor_carga_movimientos: {
        Row: {
          carga_id: string
          movimiento_id: string
        }
        Insert: {
          carga_id: string
          movimiento_id: string
        }
        Update: {
          carga_id?: string
          movimiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "totvs_mayor_carga_movimientos_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_mayor_carga_movimientos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_mayor_cargas: {
        Row: {
          archivo_nombre: string
          archivo_sha256: string
          archivo_tamano: number
          cancelado_en: string | null
          completado_en: string | null
          creado_en: string
          creado_por: string
          estado: string
          fecha_desde: string | null
          fecha_hasta: string | null
          filas_apertura: number
          filas_cuarentena: number
          filas_tpsldo_1: number
          filas_tpsldo_9: number
          filas_vinculadas: number
          id: string
          neto_tpsldo_1_pyg: number
          neto_tpsldo_1_usd: number
          neto_tpsldo_9_pyg: number
          neto_tpsldo_9_usd: number
        }
        Insert: {
          archivo_nombre: string
          archivo_sha256: string
          archivo_tamano: number
          cancelado_en?: string | null
          completado_en?: string | null
          creado_en?: string
          creado_por: string
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          filas_apertura?: number
          filas_cuarentena?: number
          filas_tpsldo_1?: number
          filas_tpsldo_9?: number
          filas_vinculadas?: number
          id?: string
          neto_tpsldo_1_pyg?: number
          neto_tpsldo_1_usd?: number
          neto_tpsldo_9_pyg?: number
          neto_tpsldo_9_usd?: number
        }
        Update: {
          archivo_nombre?: string
          archivo_sha256?: string
          archivo_tamano?: number
          cancelado_en?: string | null
          completado_en?: string | null
          creado_en?: string
          creado_por?: string
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          filas_apertura?: number
          filas_cuarentena?: number
          filas_tpsldo_1?: number
          filas_tpsldo_9?: number
          filas_vinculadas?: number
          id?: string
          neto_tpsldo_1_pyg?: number
          neto_tpsldo_1_usd?: number
          neto_tpsldo_9_pyg?: number
          neto_tpsldo_9_usd?: number
        }
        Relationships: []
      }
      totvs_mayor_cuarentena: {
        Row: {
          motivo: string
          movimiento_id: string
          resolucion: string | null
          resuelta: boolean
          resuelta_en: string | null
          resuelta_por: string | null
        }
        Insert: {
          motivo: string
          movimiento_id: string
          resolucion?: string | null
          resuelta?: boolean
          resuelta_en?: string | null
          resuelta_por?: string | null
        }
        Update: {
          motivo?: string
          movimiento_id?: string
          resolucion?: string | null
          resuelta?: boolean
          resuelta_en?: string | null
          resuelta_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totvs_mayor_cuarentena_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: true
            referencedRelation: "totvs_mayor_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_mayor_cuentas_clasificacion: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          categoria: string | null
          creada_en: string
          creada_por: string | null
          cuenta_codigo: string
          estado: string
          fundamento: string | null
          origen: string
          subcategoria: string | null
          version: number
        }
        Insert: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          categoria?: string | null
          creada_en?: string
          creada_por?: string | null
          cuenta_codigo: string
          estado: string
          fundamento?: string | null
          origen?: string
          subcategoria?: string | null
          version: number
        }
        Update: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          categoria?: string | null
          creada_en?: string
          creada_por?: string | null
          cuenta_codigo?: string
          estado?: string
          fundamento?: string | null
          origen?: string
          subcategoria?: string | null
          version?: number
        }
        Relationships: []
      }
      totvs_mayor_movimientos: {
        Row: {
          anio_mes: string | null
          archivo_origen: string
          asiento: string | null
          centro_costo: string | null
          centro_costo_descripcion: string | null
          clave_origen: string
          cliente: string | null
          contraparte_codigo: string | null
          contraparte_tienda: string | null
          creado_en: string
          cuenta_codigo: string | null
          cuenta_descripcion: string | null
          datos_fuente: Json
          documento: string
          documento_asociado: string | null
          es_apertura: boolean
          fecha_fuente: string
          fecha_inclusion: string | null
          fecha_movimiento: string
          fila_origen: number
          historial: string | null
          huella_md5: string | null
          huella_origen: string
          id: string
          importe_pyg: number
          importe_usd: number
          item_contable: string | null
          linea: string
          lote: string
          origen: string | null
          primera_carga_id: string
          sublote: string
          sucursal: string
          tipo_asiento: string | null
          tipo_movimiento: string
          tipo_saldo: string
          usuario_nombre: string | null
        }
        Insert: {
          anio_mes?: string | null
          archivo_origen: string
          asiento?: string | null
          centro_costo?: string | null
          centro_costo_descripcion?: string | null
          clave_origen: string
          cliente?: string | null
          contraparte_codigo?: string | null
          contraparte_tienda?: string | null
          creado_en?: string
          cuenta_codigo?: string | null
          cuenta_descripcion?: string | null
          datos_fuente?: Json
          documento: string
          documento_asociado?: string | null
          es_apertura: boolean
          fecha_fuente: string
          fecha_inclusion?: string | null
          fecha_movimiento: string
          fila_origen: number
          historial?: string | null
          huella_md5?: string | null
          huella_origen: string
          id?: string
          importe_pyg: number
          importe_usd: number
          item_contable?: string | null
          linea: string
          lote: string
          origen?: string | null
          primera_carga_id: string
          sublote: string
          sucursal: string
          tipo_asiento?: string | null
          tipo_movimiento: string
          tipo_saldo: string
          usuario_nombre?: string | null
        }
        Update: {
          anio_mes?: string | null
          archivo_origen?: string
          asiento?: string | null
          centro_costo?: string | null
          centro_costo_descripcion?: string | null
          clave_origen?: string
          cliente?: string | null
          contraparte_codigo?: string | null
          contraparte_tienda?: string | null
          creado_en?: string
          cuenta_codigo?: string | null
          cuenta_descripcion?: string | null
          datos_fuente?: Json
          documento?: string
          documento_asociado?: string | null
          es_apertura?: boolean
          fecha_fuente?: string
          fecha_inclusion?: string | null
          fecha_movimiento?: string
          fila_origen?: number
          historial?: string | null
          huella_md5?: string | null
          huella_origen?: string
          id?: string
          importe_pyg?: number
          importe_usd?: number
          item_contable?: string | null
          linea?: string
          lote?: string
          origen?: string | null
          primera_carga_id?: string
          sublote?: string
          sucursal?: string
          tipo_asiento?: string | null
          tipo_movimiento?: string
          tipo_saldo?: string
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totvs_mayor_movimientos_primera_carga_id_fkey"
            columns: ["primera_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_mayor_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      totvs_mayor_periodos_estado: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          estado: string
          fundamento: string | null
          origen: string
          periodo: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          estado: string
          fundamento?: string | null
          origen?: string
          periodo: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          estado?: string
          fundamento?: string | null
          origen?: string
          periodo?: string
        }
        Relationships: []
      }
      totvs_pedidos_venta_lineas: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          cantidad: number
          cantidad_entregada: number
          cantidad_pendiente: number
          carga_id: string
          cliente_codigo: string | null
          cliente_nombre: string | null
          condicion_pago: string | null
          creado_en: string
          datos_fuente: Json
          descripcion: string | null
          estado: string | null
          fabricante_codigo: string | null
          factura: string | null
          fecha_emision: string
          fila_origen: number
          filial: string
          genera: string | null
          huella_origen: string
          id: string
          item: string
          item_presupuesto: string | null
          moneda: string | null
          naturaleza: string | null
          nro_pedido: string
          nro_presupuesto: string | null
          precio_unitario: number
          producto_codigo: string
          serie_factura: string | null
          tipo_entrada: string | null
          unidad: string | null
          valor_total: number
          vendedor: string | null
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          cantidad: number
          cantidad_entregada: number
          cantidad_pendiente: number
          carga_id: string
          cliente_codigo?: string | null
          cliente_nombre?: string | null
          condicion_pago?: string | null
          creado_en?: string
          datos_fuente?: Json
          descripcion?: string | null
          estado?: string | null
          fabricante_codigo?: string | null
          factura?: string | null
          fecha_emision: string
          fila_origen: number
          filial: string
          genera?: string | null
          huella_origen: string
          id?: string
          item: string
          item_presupuesto?: string | null
          moneda?: string | null
          naturaleza?: string | null
          nro_pedido: string
          nro_presupuesto?: string | null
          precio_unitario: number
          producto_codigo: string
          serie_factura?: string | null
          tipo_entrada?: string | null
          unidad?: string | null
          valor_total: number
          vendedor?: string | null
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          cantidad?: number
          cantidad_entregada?: number
          cantidad_pendiente?: number
          carga_id?: string
          cliente_codigo?: string | null
          cliente_nombre?: string | null
          condicion_pago?: string | null
          creado_en?: string
          datos_fuente?: Json
          descripcion?: string | null
          estado?: string | null
          fabricante_codigo?: string | null
          factura?: string | null
          fecha_emision?: string
          fila_origen?: number
          filial?: string
          genera?: string | null
          huella_origen?: string
          id?: string
          item?: string
          item_presupuesto?: string | null
          moneda?: string | null
          naturaleza?: string | null
          nro_pedido?: string
          nro_presupuesto?: string | null
          precio_unitario?: number
          producto_codigo?: string
          serie_factura?: string | null
          tipo_entrada?: string | null
          unidad?: string | null
          valor_total?: number
          vendedor?: string | null
        }
        Relationships: []
      }
      totvs_proveedores: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          carga_id: string
          codigo: string
          creado_en: string
          datos_fuente: Json
          departamento: string | null
          direccion: string | null
          email: string | null
          estado: string | null
          fila_origen: number
          huella_origen: string
          id: string
          municipio: string | null
          nombre_fantasia: string | null
          pais: string | null
          razon_social: string
          retencion_bandera_1: string | null
          retencion_bandera_2: string | null
          ruc: string | null
          telefono: string | null
          tienda: string
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          carga_id: string
          codigo: string
          creado_en?: string
          datos_fuente?: Json
          departamento?: string | null
          direccion?: string | null
          email?: string | null
          estado?: string | null
          fila_origen: number
          huella_origen: string
          id?: string
          municipio?: string | null
          nombre_fantasia?: string | null
          pais?: string | null
          razon_social: string
          retencion_bandera_1?: string | null
          retencion_bandera_2?: string | null
          ruc?: string | null
          telefono?: string | null
          tienda: string
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          carga_id?: string
          codigo?: string
          creado_en?: string
          datos_fuente?: Json
          departamento?: string | null
          direccion?: string | null
          email?: string | null
          estado?: string | null
          fila_origen?: number
          huella_origen?: string
          id?: string
          municipio?: string | null
          nombre_fantasia?: string | null
          pais?: string | null
          razon_social?: string
          retencion_bandera_1?: string | null
          retencion_bandera_2?: string | null
          ruc?: string | null
          telefono?: string | null
          tienda?: string
        }
        Relationships: []
      }
      totvs_transferencias_transito: {
        Row: {
          actualizado_en: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          creado_en: string
          datos_fuente: Json
          destino: string
          fecha_emision: string
          fila_origen: number
          huella_origen: string
          id: string
          item: string
          numero_documento: string
          observacion: string | null
          origen: string
          producto_codigo: string
          producto_descripcion: string | null
          serie_documento: string
          vigente: boolean
        }
        Insert: {
          actualizado_en?: string
          archivo_origen: string
          cantidad: number
          carga_id: string
          creado_en?: string
          datos_fuente?: Json
          destino: string
          fecha_emision: string
          fila_origen: number
          huella_origen: string
          id?: string
          item: string
          numero_documento: string
          observacion?: string | null
          origen: string
          producto_codigo: string
          producto_descripcion?: string | null
          serie_documento: string
          vigente?: boolean
        }
        Update: {
          actualizado_en?: string
          archivo_origen?: string
          cantidad?: number
          carga_id?: string
          creado_en?: string
          datos_fuente?: Json
          destino?: string
          fecha_emision?: string
          fila_origen?: number
          huella_origen?: string
          id?: string
          item?: string
          numero_documento?: string
          observacion?: string | null
          origen?: string
          producto_codigo?: string
          producto_descripcion?: string | null
          serie_documento?: string
          vigente?: boolean
        }
        Relationships: []
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
      user_presence: {
        Row: {
          disconnected_at: string | null
          last_activity_at: string
          last_heartbeat_at: string
          user_id: string
        }
        Insert: {
          disconnected_at?: string | null
          last_activity_at?: string
          last_heartbeat_at?: string
          user_id: string
        }
        Update: {
          disconnected_at?: string | null
          last_activity_at?: string
          last_heartbeat_at?: string
          user_id?: string
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
      user_seccion_acceso: {
        Row: {
          otorgado_en: string
          otorgado_por: string | null
          seccion_id: string
          user_id: string
        }
        Insert: {
          otorgado_en?: string
          otorgado_por?: string | null
          seccion_id: string
          user_id: string
        }
        Update: {
          otorgado_en?: string
          otorgado_por?: string | null
          seccion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_seccion_acceso_seccion_id_fkey"
            columns: ["seccion_id"]
            isOneToOne: false
            referencedRelation: "app_secciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_maquinas_historico_cargas: {
        Row: {
          activo: boolean
          archivo_nombre: string
          archivos: number
          completado_en: string | null
          creado_en: string
          creado_por: string | null
          estado: string
          fecha_desde: string | null
          fecha_hasta: string | null
          filas_archivo: number
          id: string
          iva_estado: string
          moneda: string
        }
        Insert: {
          activo?: boolean
          archivo_nombre: string
          archivos?: number
          completado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          filas_archivo: number
          id?: string
          iva_estado?: string
          moneda?: string
        }
        Update: {
          activo?: boolean
          archivo_nombre?: string
          archivos?: number
          completado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          filas_archivo?: number
          id?: string
          iva_estado?: string
          moneda?: string
        }
        Relationships: []
      }
      ventas_maquinas_historico_chasis_auditoria: {
        Row: {
          archivo_nombre: string
          chasis_anterior: string | null
          chasis_nuevo: string
          creado_en: string
          ejecutado_por_rol: string
          estado: string
          fila_fuente: number
          fuente_hash: string
          hoja: string
          id: string
          linea_clave: string
          linea_id: string
          marcador: string
          texto_fuente: string
        }
        Insert: {
          archivo_nombre: string
          chasis_anterior?: string | null
          chasis_nuevo: string
          creado_en?: string
          ejecutado_por_rol?: string
          estado: string
          fila_fuente: number
          fuente_hash: string
          hoja: string
          id?: string
          linea_clave: string
          linea_id: string
          marcador: string
          texto_fuente: string
        }
        Update: {
          archivo_nombre?: string
          chasis_anterior?: string | null
          chasis_nuevo?: string
          creado_en?: string
          ejecutado_por_rol?: string
          estado?: string
          fila_fuente?: number
          fuente_hash?: string
          hoja?: string
          id?: string
          linea_clave?: string
          linea_id?: string
          marcador?: string
          texto_fuente?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_maquinas_historico_chasis_auditoria_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "ventas_maquinas_historico_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_maquinas_historico_lineas: {
        Row: {
          cantidad: number
          carga_id: string
          chasis: string | null
          cod_entidad: string | null
          cod_mercaderia: string
          codigo_pedido: string | null
          costo_medio: number
          costo_total: number
          creado_en: string
          entidad_nombre: string
          factura: string
          fecha_factura: string
          fecha_pedido: string | null
          fecha_vencimiento: string | null
          grupo: string
          id: string
          linea_clave: string
          lucro_bruto: number
          marca_estimada: Database["public"]["Enums"]["marca"]
          margen_costo_pct: number
          margen_venta_pct: number
          modelo_estimado: string
          nombre_mercaderia: string
          plan_financiacion: string | null
          precio_tabla: number
          raw_data: Json
          saldo: number
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_maquina_estimado: string
          tipo_movimiento: string
          total_cobrado: number
          total_venta: number
          unidades_fisicas: number
          valor_medio: number
          vendedor: string | null
        }
        Insert: {
          cantidad: number
          carga_id: string
          chasis?: string | null
          cod_entidad?: string | null
          cod_mercaderia: string
          codigo_pedido?: string | null
          costo_medio?: number
          costo_total?: number
          creado_en?: string
          entidad_nombre: string
          factura: string
          fecha_factura: string
          fecha_pedido?: string | null
          fecha_vencimiento?: string | null
          grupo: string
          id?: string
          linea_clave: string
          lucro_bruto?: number
          marca_estimada?: Database["public"]["Enums"]["marca"]
          margen_costo_pct?: number
          margen_venta_pct?: number
          modelo_estimado?: string
          nombre_mercaderia: string
          plan_financiacion?: string | null
          precio_tabla?: number
          raw_data?: Json
          saldo?: number
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_maquina_estimado?: string
          tipo_movimiento: string
          total_cobrado?: number
          total_venta: number
          unidades_fisicas: number
          valor_medio?: number
          vendedor?: string | null
        }
        Update: {
          cantidad?: number
          carga_id?: string
          chasis?: string | null
          cod_entidad?: string | null
          cod_mercaderia?: string
          codigo_pedido?: string | null
          costo_medio?: number
          costo_total?: number
          creado_en?: string
          entidad_nombre?: string
          factura?: string
          fecha_factura?: string
          fecha_pedido?: string | null
          fecha_vencimiento?: string | null
          grupo?: string
          id?: string
          linea_clave?: string
          lucro_bruto?: number
          marca_estimada?: Database["public"]["Enums"]["marca"]
          margen_costo_pct?: number
          margen_venta_pct?: number
          modelo_estimado?: string
          nombre_mercaderia?: string
          plan_financiacion?: string | null
          precio_tabla?: number
          raw_data?: Json
          saldo?: number
          sucursal?: Database["public"]["Enums"]["sucursal"]
          tipo_maquina_estimado?: string
          tipo_movimiento?: string
          total_cobrado?: number
          total_venta?: number
          unidades_fisicas?: number
          valor_medio?: number
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_maquinas_historico_lineas_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "ventas_maquinas_historico_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      maquinaria_facturas_importacion_detalle: {
        Row: {
          actualizado_en: string | null
          cantidad_lote: number | null
          chasis: string | null
          costo_unidad: number | null
          documento_id: string | null
          factura_fecha: string | null
          factura_id: string | null
          factura_numero: string | null
          importacion_linea_id: string | null
          importacion_unidad_id: string | null
          modelo: string | null
          moneda: string | null
          numero_unidad: number | null
          operacion_id: string | null
          pedido_unidad_id: string | null
          producto: string | null
          proveedor: string | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_facturas_importacion_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_facturas_importacion_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["pedido_unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["pedido_unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["pedido_unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["pedido_unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_importacion_np_disponibles: {
        Row: {
          cliente_nombre: string | null
          linea_id: string | null
          marca: string | null
          modelo: string | null
          np_numero: string | null
          operacion_id: string | null
          producto: string | null
          unidades_disponibles: number | null
        }
        Relationships: []
      }
      maquinaria_importacion_unidades_asignables: {
        Row: {
          activa: boolean | null
          actualizado_en: string | null
          ata: string | null
          cantidad: number | null
          cantidad_lote: number | null
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
          detalle_manual: boolean | null
          diferencia: number | null
          disponibilidad_detalle: string | null
          estado_disponibilidad: string | null
          estado_fuente: string | null
          eta: string | null
          factura_proveedor_fecha: string | null
          factura_proveedor_moneda: string | null
          factura_venta: string | null
          fecha_pedido: string | null
          flete_seguro: number | null
          id: string | null
          importacion_linea_id: string | null
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          marca: string | null
          margen_porcentaje: number | null
          modelo: string | null
          notas: string | null
          np_fecha: string | null
          np_numero: string | null
          numero_unidad: number | null
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
          vinculo_manual: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_importacion_unidades_historicas: {
        Row: {
          activa: boolean | null
          actualizado_en: string | null
          ata: string | null
          cantidad: number | null
          cantidad_lote: number | null
          chasis: string | null
          chasis_normalizado: string | null
          cliente_nombre: string | null
          comercial: string | null
          costo_final: number | null
          costo_final_sin_iva: number | null
          creado_en: string | null
          datos_fuente: Json | null
          descuento_especial: number | null
          descuentos: number | null
          destino: string | null
          detalle_manual: boolean | null
          diferencia: number | null
          disponibilidad_detalle: string | null
          estado_disponibilidad: string | null
          estado_fuente: string | null
          eta: string | null
          factura_proveedor_fecha: string | null
          factura_proveedor_moneda: string | null
          factura_venta: string | null
          fecha_pedido: string | null
          flete_seguro: number | null
          id: string | null
          importacion_linea_id: string | null
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          marca: string | null
          margen_porcentaje: number | null
          modelo: string | null
          notas: string | null
          np_fecha: string | null
          np_numero: string | null
          numero_unidad: number | null
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
          vinculo_manual: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_importacion_unidades_operativas: {
        Row: {
          activa: boolean | null
          actualizado_en: string | null
          alcance_valor_oc: string | null
          ata: string | null
          cantidad: number | null
          cantidad_lote: number | null
          chasis: string | null
          chasis_ambiguo: boolean | null
          cliente_nombre: string | null
          comercial: string | null
          costo_final: number | null
          costo_final_sin_iva: number | null
          costo_stock_habilitado: boolean | null
          costo_stock_moneda: string | null
          creado_en: string | null
          datos_fuente: Json | null
          descuento_especial: number | null
          descuentos: number | null
          destino: string | null
          detalle_manual: boolean | null
          diferencia: number | null
          disponibilidad_detalle: string | null
          estado_disponibilidad: string | null
          estado_fuente: string | null
          estado_general: string | null
          eta: string | null
          eta_general: string | null
          eta_manual: boolean | null
          factura_proveedor_fecha: string | null
          factura_proveedor_moneda: string | null
          factura_venta: string | null
          fecha_pedido: string | null
          flete_seguro: number | null
          id: string | null
          importacion_linea_id: string | null
          invoice_supplier: string | null
          linea_id: string | null
          llave_interna: string | null
          llave_interna_general: string | null
          marca: string | null
          margen_porcentaje: number | null
          modelo: string | null
          modelo_original: string | null
          moneda_oc: string | null
          moneda_oc_general: string | null
          notas: string | null
          np_fecha: string | null
          np_numero: string | null
          numero_unidad: number | null
          oc: string | null
          oc_monedas_diferentes: boolean | null
          operacion_id: string | null
          origen: string | null
          parque_confirmado: boolean | null
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
          stock_fisico_confirmado: boolean | null
          stock_saldo: number | null
          stock_sucursal: Database["public"]["Enums"]["sucursal"] | null
          tipo_cambio: number | null
          transporte: string | null
          unidad_id: string | null
          utilidad: number | null
          valor_factura_proveedor: number | null
          valor_oc_asignado_total: number | null
          valor_oc_general: number | null
          valor_oc_manual: boolean | null
          valor_venta: number | null
          venta_facturada: string | null
          vinculo_manual: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["linea_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["linea_operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_operaciones_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_operacion_id_fkey"
            columns: ["operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["operacion_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "maquinaria_importacion_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
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
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["linea_id"]
          },
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["linea_id"]
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
            referencedRelation: "maquinaria_importacion_np_disponibles"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["operacion_id"]
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
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
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
            referencedColumns: ["unidad_vinculada_id"]
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
          moneda_valor: string | null
          np_fecha: string | null
          np_numero: string | null
          observaciones: string | null
          requiere_importacion: boolean | null
          unidades: number | null
          unidades_facturadas: number | null
          valor_acordado: number | null
          valor_facturado: number | null
          valor_venta: number | null
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
      maquinaria_pedidos_lineas_estado_actual: {
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
          es_historico: boolean | null
          estado_disponibilidad: string | null
          estado_fuente: string | null
          estado_importacion_fuente: string | null
          estado_operacion: string | null
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
          moneda_valor: string | null
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
          es_historico: boolean | null
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
          moneda_valor: string | null
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
          unidad_vinculada_id: string | null
          vinculo_persistente: boolean | null
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
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_estado_actual"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_pedidos_lineas_operativas"
            referencedColumns: ["unidad_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_stock_trazabilidad"
            referencedColumns: ["unidad_vinculada_id"]
          },
          {
            foreignKeyName: "parque_stock_maquinas_unidad_operacion_id_fkey"
            columns: ["unidad_operacion_id"]
            isOneToOne: false
            referencedRelation: "maquinaria_unidades_operacion"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinaria_vinculos_sugeridos: {
        Row: {
          chasis: string | null
          linea_id: string | null
          marca: string | null
          modelo: string | null
          motivo: string | null
          operacion_id: string | null
          recurso_id: string | null
          tipo: string | null
          ubicacion: string | null
          unidad_id: string | null
        }
        Relationships: []
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
            referencedRelation: "v_repuestos_semaforo_historico"
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
      totvs_cxc_resumen_agregado: {
        Row: {
          anticipos_cliente: number | null
          anticipos_cliente_saldo_cero: number | null
          anticipos_cliente_saldo_negativo: number | null
          anticipos_cliente_saldo_positivo: number | null
          carga_id: string | null
          clientes: number | null
          completado_en: string | null
          facturas_elegibles: number | null
          facturas_futuras: number | null
          facturas_vence_hoy: number | null
          facturas_vencidas: number | null
          fecha_corte: string | null
          filas_documento: number | null
          filas_saldo_cero: number | null
          filas_saldo_negativo: number | null
          moneda: string | null
          porcentaje_saldo_vencido: number | null
          positivos_no_factura: number | null
          reemplaza_carga_id: string | null
          saldo_anticipos_cliente: number | null
          saldo_anticipos_negativo: number | null
          saldo_anticipos_positivo: number | null
          saldo_futuro: number | null
          saldo_negativo: number | null
          saldo_pendiente_elegible: number | null
          saldo_positivo_no_factura: number | null
          saldo_vence_hoy: number | null
          saldo_vencido: number | null
          snapshot_version: number | null
          sucursal: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totvs_cxc_cargas_reemplaza_carga_id_fkey"
            columns: ["reemplaza_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "totvs_cxc_cargas_reemplaza_carga_id_fkey"
            columns: ["reemplaza_carga_id"]
            isOneToOne: false
            referencedRelation: "totvs_cxc_resumen_agregado"
            referencedColumns: ["carga_id"]
          },
        ]
      }
      totvs_mayor_resumen_agregado: {
        Row: {
          categoria: string | null
          centro_costo: string | null
          clasificacion_estado: string | null
          clasificacion_version: number | null
          cuenta_codigo: string | null
          cuenta_descripcion: string | null
          es_apertura: boolean | null
          filas: number | null
          filas_cuarentena: number | null
          importe_absoluto_pyg: number | null
          importe_absoluto_usd: number | null
          importe_excluido_pyg: number | null
          importe_excluido_usd: number | null
          importe_pyg: number | null
          importe_usd: number | null
          periodo: string | null
          periodo_estado: string | null
          subcategoria: string | null
          sucursal: string | null
          tipo_saldo: string | null
        }
        Relationships: []
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
      v_repuestos_analisis_ubicaciones: {
        Row: {
          deposito: string | null
          kardex_archivo: string | null
          kardex_cargado_en: string | null
          producto_codigo: string | null
          saldo_kardex: number | null
          stock: number | null
          sucursal: string | null
          valor_kardex_usd: number | null
        }
        Relationships: []
      }
      v_repuestos_compras_importadas_conciliacion: {
        Row: {
          cantidad_despacho: number | null
          cantidad_kardex: number | null
          documento: string | null
          estado: string | null
          fecha_documento: string | null
          fecha_kardex: string | null
          filas_despacho: number | null
          filas_kardex: number | null
          producto_codigo: string | null
          proveedor: string | null
          referencias_despacho: Json | null
          referencias_kardex: Json | null
          serie: string | null
          sucursal: string | null
        }
        Relationships: []
      }
      v_repuestos_inventario_gerencial_fuente_v1: {
        Row: {
          codigo: string | null
          estado_vinculo: string | null
          fecha_corte: string | null
          stock_total: number | null
          ventas_12m: number | null
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
      v_repuestos_semaforo_historico: {
        Row: {
          campo_9: number | null
          codigo_anterior_ejemplo: string | null
          codigo_fabricante: string | null
          codigo_interno: string | null
          codigos_anteriores: number | null
          color: string | null
          descripcion: string | null
          dias_ultima_venta: number | null
          familia: string | null
          fecha_analisis: string | null
          kardex_archivo: string | null
          kardex_cargado_en: string | null
          katuete: number | null
          loma_plata: number | null
          marca: Database["public"]["Enums"]["marca"] | null
          misiones: number | null
          saldo_coincide: boolean | null
          saldo_kardex: number | null
          santa_rita: number | null
          santa_rosa: number | null
          stock_total: number | null
          ultima_venta: string | null
          unidades_365d: number | null
          unidades_anio_actual: number | null
          unidades_anio_anterior: number | null
          unidades_hace_dos_anios: number | null
          valor_kardex_usd: number | null
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
      v_repuestos_ultima_compra: {
        Row: {
          fuente_compra: string | null
          producto_codigo: string | null
          ultima_compra: string | null
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
      v_ventas_repuestos_historico_completo: {
        Row: {
          cantidad: number | null
          cliente: string | null
          codigo: string | null
          codigo_fabricante: string | null
          codigo_legacy: string | null
          concepto: string | null
          descripcion: string | null
          es_nota_credito: boolean | null
          factura: string | null
          fecha: string | null
          fecha_factura: string | null
          importe: number | null
          linea_id: string | null
          sucursal: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      campi_customer_comparison_v1: { Args: { p_from: string; p_to: string }; Returns: Json }
      maquinaria_anular_pedido: { Args: { p_operacion_id: string }; Returns: Json }
      admin_actualizar_acceso_seccion: {
        Args: { p_activo: boolean; p_seccion_id: string; p_user_id: string }
        Returns: undefined
      }
      cliente_nombre_canonico: { Args: { p_nombre: string }; Returns: string }
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
          p_subgrupo_personalizado?: string
          p_sucursal?: Database["public"]["Enums"]["sucursal"]
          p_tipo_confirmacion?: string
          p_vendedor?: string
        }
        Returns: string
      }
      confirmar_notificacion_ingreso_stock_parque: {
        Args: { p_notificacion_id: string }
        Returns: string
      }
      dashboard_facturacion_fuente_v1: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          area_calculada: string
          cantidad: number
          cliente_id: string
          cod_factura: string
          cod_mercaderia: string
          codigo_fabricante: string
          concepto: string
          entidad_nombre: string
          fecha: string
          grupo: string
          grupo_fx: string
          id: string
          marca: string
          mercaderia: string
          origen_sistema: string
          raw_data: Json
          sucursal: string
          tipo: string
          tipo_tiempo: string
          total_venta: number
        }[]
      }
      dashboard_facturacion_lote_v1: {
        Args: { p_desde: string; p_hasta: string }
        Returns: Json
      }
      dashboard_facturacion_movimientos_v1: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          area_calculada: string
          cantidad: number
          cliente_id: string
          cod_factura: string
          cod_mercaderia: string
          codigo_fabricante: string
          concepto: string
          entidad_nombre: string
          fecha: string
          grupo: string
          grupo_fx: string
          id: string
          marca: string
          mercaderia: string
          origen_sistema: string
          raw_data: Json
          sucursal: string
          tipo: string
          tipo_tiempo: string
          total_venta: number
        }[]
      }
      descartar_notificacion_venta_maquina: {
        Args: { p_notificacion_id: string }
        Returns: undefined
      }
      disconnect_user_presence: { Args: never; Returns: undefined }
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
      facturacion_acreditar_fuente_existente_v1: {
        Args: {
          p_desde: string
          p_hasta: string
          p_importacion: Json
          p_importacion_id: string
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
          p_source_identity: Json
        }
        Returns: Json
      }
      facturacion_importar_totvs_lote_con_fuente_v1: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_importacion: Json
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
        }
        Returns: Json
      }
      facturacion_importar_totvs_lote_core_consolidacion_v1: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_importacion: Json
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
        }
        Returns: Json
      }
      facturacion_importar_totvs_lote_core_group_enrichment_v1: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_importacion: Json
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
        }
        Returns: Json
      }
      facturacion_importar_totvs_lote_core_procedencia_v1: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_importacion: Json
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
        }
        Returns: Json
      }
      facturacion_importar_totvs_lote_v1: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_importacion: Json
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
        }
        Returns: Json
      }
      facturacion_tipo_tiempo_campos: {
        Args: { p_entidad: string; p_observacion: string }
        Returns: string
      }
      facturacion_totvs_codigo_fabricante_equivalente: {
        Args: {
          p_entrante: string
          p_guardado: string
          p_sku_entrante: string
          p_sku_guardado: string
        }
        Returns: boolean
      }
      facturacion_totvs_fingerprint_auditado: {
        Args: { p_linea: Json }
        Returns: string
      }
      facturacion_totvs_firma_base: { Args: { p_linea: Json }; Returns: Json }
      facturacion_totvs_firma_comercial: {
        Args: { p_linea: Json }
        Returns: Json
      }
      facturacion_totvs_identidad: {
        Args: {
          p_documento: string
          p_item: string
          p_origen: string
          p_sucursal: string
          p_tipo_documento: string
        }
        Returns: string
      }
      facturacion_totvs_plan_grupo_descriptivo_v1: {
        Args: { p_entrada: Json; p_guardada: Json }
        Returns: Json
      }
      facturacion_totvs_preparar_reimportacion: {
        Args: { p_entrada: Json; p_guardada: Json }
        Returns: Json
      }
      facturacion_totvs_sucursal_canonica: {
        Args: { p_sucursal: string }
        Returns: string
      }
      facturacion_validar_totvs_lote_v1: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_importacion: Json
          p_lineas: Json
          p_reemplazar_resumen?: boolean
          p_resumen: Json
        }
        Returns: Json
      }
      fleet_actor_name: { Args: { p_user_id: string }; Returns: string }
      fleet_add_odometer_reading: {
        Args: {
          p_odometer_km: number
          p_reading_date: string
          p_vehicle_id: string
        }
        Returns: string
      }
      fleet_assert_write_access: { Args: never; Returns: string }
      fleet_correct_odometer_reading: {
        Args: {
          p_odometer_km: number
          p_reading_date: string
          p_reading_id: string
          p_reason: string
        }
        Returns: string
      }
      fleet_create_vehicle: {
        Args: {
          p_brand: string
          p_initial_odometer_km?: number
          p_initial_reading_date?: string
          p_model?: string
          p_plate: string
        }
        Returns: string
      }
      fleet_list_responsible_candidates: {
        Args: never
        Returns: {
          es_tecnico: boolean
          id: string
          nombre: string
          sucursal: Database["public"]["Enums"]["sucursal"]
        }[]
      }
      fleet_normalize_plate: { Args: { p_plate: string }; Returns: string }
      fleet_set_vehicle_responsible: {
        Args: {
          p_effective_date: string
          p_responsible_profile_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      generar_notificacion_venta_maquina: {
        Args: { p_linea_id: string }
        Returns: string
      }
      generar_notificaciones_stock_en_parque: {
        Args: { p_carga_id: string }
        Returns: number
      }
      gerencial_clientes_movimientos_posventa_v1: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cliente_id: string
          contrato: string
          fecha: string
          sucursal: string
          total_venta: number
        }[]
      }
      gerencial_clientes_resumen_v1: {
        Args: {
          p_desde: string
          p_hasta: string
          p_prev_desde: string
          p_prev_hasta: string
          p_sucursal?: string
        }
        Returns: {
          clientes_alerta: number
          clientes_evaluables: number
          clientes_historial_insuficiente: number
          clientes_revision_ritmo: number
          compradores_actual: number
          compradores_base: number
          compradores_base_sin_recompra: number
          compradores_retenidos: number
          propietarios_con_compra_actual: number
          propietarios_elegibles: number
        }[]
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
      has_section_access: {
        Args: { _seccion_id: string; _user_id: string }
        Returns: boolean
      }
      inactividad_clientes_senal_v1: {
        Args: { p_corte: string; p_sucursal?: string }
        Returns: {
          clientes_alerta: number
          clientes_evaluables: number
          clientes_historial_insuficiente: number
          clientes_revision_ritmo: number
        }[]
      }
      inferir_subgrupo_maquina_notificacion: {
        Args: { p_texto: string }
        Returns: Database["public"]["Enums"]["subgrupo_maquina"]
      }
      is_active_app_user: { Args: { _user_id: string }; Returns: boolean }
      managerial_facturacion_resumen_v1: {
        Args: { p_desde: string; p_hasta: string; p_sucursal?: string }
        Returns: Json
      }
      managerial_inventario_resumen_v1: { Args: never; Returns: Json }
      maquinaria_actualizar_operacion: {
        Args: { p_lineas: Json; p_operacion: Json; p_operacion_id: string }
        Returns: string
      }
      maquinaria_actualizar_operacion_preservando_estado: {
        Args: { p_lineas: Json; p_operacion: Json; p_operacion_id: string }
        Returns: string
      }
      maquinaria_actualizar_unidad_importacion: {
        Args: { p_datos: Json; p_unidad_id: string }
        Returns: undefined
      }
      maquinaria_anular_recepcion_importacion: {
        Args: { p_importacion_unidad_id: string }
        Returns: Json
      }
      maquinaria_aplicar_factura_importacion: {
        Args: {
          p_factura_fecha: string
          p_factura_numero: string
          p_moneda: string
          p_operacion_id: string
          p_proveedor: string
          p_unidades: Json
          p_valor_total: number
        }
        Returns: Json
      }
      maquinaria_asignar_importacion: {
        Args: { p_importacion_id: string; p_unidad_id: string }
        Returns: Json
      }
      maquinaria_asignar_stock: {
        Args: { p_chasis?: string; p_stock_id: string; p_unidad_id: string }
        Returns: Json
      }
      maquinaria_chasis_confirmado_en_sistema: {
        Args: { p_chasis: string }
        Returns: boolean
      }
      maquinaria_chasis_unico_en_stock: {
        Args: { p_chasis: string }
        Returns: boolean
      }
      maquinaria_cliente_es_stock_interno: {
        Args: { p_nombre: string }
        Returns: boolean
      }
      maquinaria_conciliar_factura_venta: {
        Args: { p_facturacion_linea_id: string }
        Returns: string
      }
      maquinaria_eliminar_factura_venta: {
        Args: { p_documento_id: string }
        Returns: Json
      }
      maquinaria_eliminar_linea_pedido: {
        Args: { p_linea_id: string }
        Returns: Json
      }
      maquinaria_eliminar_pedido: {
        Args: { p_operacion_id: string }
        Returns: Json
      }
      maquinaria_eliminar_unidad_importacion: {
        Args: { p_importacion_unidad_id: string }
        Returns: Json
      }
      maquinaria_gestionar_catalogo: {
        Args: {
          p_accion: string
          p_id: string
          p_nombre?: string
          p_subgrupo?: string
          p_tipo: string
        }
        Returns: undefined
      }
      maquinaria_guardar_importacion: {
        Args: { p_datos: Json; p_importacion_id: string }
        Returns: string
      }
      maquinaria_importar_historico_pedidos: {
        Args: { p_filas: Json }
        Returns: Json
      }
      maquinaria_importar_maestro_importaciones: {
        Args: { p_filas: Json }
        Returns: Json
      }
      maquinaria_iniciar_transito_importacion: {
        Args: { p_importacion_unidad_id: string }
        Returns: undefined
      }
      maquinaria_intentar_autovinculo_historico: {
        Args: { p_chasis: string }
        Returns: boolean
      }
      maquinaria_llave_importacion: {
        Args: {
          p_cantidad: number
          p_marca: string
          p_numero: number
          p_oc: string
          p_referencia: string
        }
        Returns: string
      }
      maquinaria_marca_admitida: {
        Args: { p_marca: Database["public"]["Enums"]["marca"] }
        Returns: boolean
      }
      maquinaria_normalizar_marca: {
        Args: { p_marca: string }
        Returns: string
      }
      maquinaria_np_canonica: { Args: { p_numero: string }; Returns: string }
      maquinaria_parsear_fecha_pedido_legacy: {
        Args: { p_valor: string }
        Returns: string
      }
      maquinaria_puede_gestionar_flujo: { Args: never; Returns: boolean }
      maquinaria_recibir_unidad_importacion: {
        Args: { p_fecha: string; p_importacion_unidad_id: string }
        Returns: Json
      }
      maquinaria_registrar_marca_catalogo: {
        Args: { p_marca: string }
        Returns: string
      }
      maquinaria_registrar_modelo_catalogo: {
        Args: {
          p_marca: string
          p_nombre: string
          p_subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Returns: string
      }
      maquinaria_registrar_operacion: {
        Args: { p_lineas: Json; p_operacion: Json }
        Returns: string
      }
      maquinaria_resolver_modelo_catalogo: {
        Args: {
          p_marca: string
          p_nombre: string
          p_subgrupo: Database["public"]["Enums"]["subgrupo_maquina"]
        }
        Returns: string
      }
      maquinaria_subgrupo_desde_producto: {
        Args: { p_producto: string }
        Returns: Database["public"]["Enums"]["subgrupo_maquina"]
      }
      maquinaria_unidad_tiene_venta_confirmada: {
        Args: { p_unidad_id: string }
        Returns: boolean
      }
      maquinaria_unidades_facturadas_confirmadas: {
        Args: { p_unidad_ids: string[] }
        Returns: {
          unidad_id: string
        }[]
      }
      maquinaria_vincular_documento_factura_importacion: {
        Args: { p_documento_id: string; p_unidad_ids: string[] }
        Returns: number
      }
      maquinaria_vincular_factura_venta: {
        Args: { p_documento_id: string; p_unidad_ids: string[] }
        Returns: Json
      }
      maquinaria_vincular_importacion_historica: {
        Args: { p_importacion_id: string; p_unidad_id: string }
        Returns: Json
      }
      normalizar_chasis_notificacion: {
        Args: { p_valor: string }
        Returns: string
      }
      normalizar_cliente_notificacion: {
        Args: { p_nombre: string }
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
      notificacion_venta_mismo_cliente: {
        Args: {
          p_cliente_facturado_id: string
          p_cliente_facturado_nombre: string
          p_parque_maquina_id: string
        }
        Returns: boolean
      }
      notificaciones_marcar_vista: {
        Args: { p_notificacion_id: string }
        Returns: undefined
      }
      ordenes_servicio_reconciliar_snapshot: {
        Args: {
          p_desde: string
          p_hasta: string
          p_importacion_id: string
          p_os_numeros: string[]
        }
        Returns: Json
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
      parque_stock_proyectado_identidad: {
        Args: { p_marca: string; p_modelo: string; p_tipo: string }
        Returns: {
          marca: string
          modelo: string
          modelo_clave: string
          tipo: string
        }[]
      }
      parque_stock_proyectado_v1: { Args: { p_corte: string }; Returns: Json }
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
      repuestos_actualizar_ventas_periodo: {
        Args: { p_desde: string; p_hasta: string }
        Returns: Json
      }
      repuestos_analisis_deposito: { Args: { p: string }; Returns: string }
      repuestos_analisis_sucursal: { Args: { p: string }; Returns: string }
      repuestos_analisis_valorizado: {
        Args: {
          p_agrupacion?: string
          p_filtros?: Json
          p_limite?: number
          p_offset?: number
        }
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
      repuestos_catalogo_stock_exportar: {
        Args: {
          p_busqueda?: string
          p_direccion?: string
          p_estados_stock?: string[]
          p_familias?: string[]
          p_marcas?: string[]
          p_orden?: string
        }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "v_repuestos_stock_matriz"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      repuestos_catalogo_stock_paginado: {
        Args: {
          p_busqueda?: string
          p_direccion?: string
          p_estados_stock?: string[]
          p_familias?: string[]
          p_limite?: number
          p_marcas?: string[]
          p_offset?: number
          p_orden?: string
        }
        Returns: Json
      }
      repuestos_completar_notas_credito_historicas: {
        Args: { p_anclas: Json; p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      repuestos_completar_vendedores_historicos: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
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
      repuestos_importar_facturacion_historica_lote_v2: {
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
      repuestos_semaforo_historico_paginado: {
        Args: {
          p_busqueda?: string
          p_color?: string
          p_limite?: number
          p_marca?: string
          p_offset?: number
          p_sucursal?: string
        }
        Returns: Json
      }
      repuestos_stock_semaforo_resumen: {
        Args: {
          p_buscar?: string
          p_estado?: string
          p_limite?: number
          p_offset?: number
          p_sucursal?: string
        }
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
      repuestos_sugerencia_viva_ordenada: {
        Args: {
          p_buscar?: string
          p_direccion?: string
          p_estado?: string
          p_fecha_analisis: string
          p_limite?: number
          p_marca: string
          p_offset?: number
          p_orden?: string
          p_segmento?: string
          p_solo_sugeridos?: boolean
        }
        Returns: Json
      }
      repuestos_verificar_notas_credito_historicas: {
        Args: { p_carga_id: string; p_claves: string[] }
        Returns: Json
      }
      repuestos_vincular_codigo_legacy: {
        Args: { p_codigo_legacy: string; p_producto_codigo: string }
        Returns: Json
      }
      retencion_clientes_cohortes_v1: {
        Args: {
          p_desde: string
          p_hasta: string
          p_prev_desde: string
          p_prev_hasta: string
          p_sucursal?: string
        }
        Returns: {
          compradores_actual: number
          compradores_base: number
          compradores_base_sin_recompra: number
          compradores_retenidos: number
        }[]
      }
      service_order_labor_hours_v1: {
        Args: {
          p_credit: boolean
          p_invoice: string
          p_rates: Json
          p_reference_total: number
          p_total: number
        }
        Returns: number
      }
      service_orders_billing_v1: {
        Args: { p_hasta: string; p_os_numeros: string[] }
        Returns: Json
      }
      service_orders_billing_v2: {
        Args: { p_hasta: string; p_os_numeros: string[] }
        Returns: Json
      }
      service_orders_work_log_v1: {
        Args: { p_desde: string; p_hasta: string; p_os?: string }
        Returns: {
          entries: Json
          order_data: Json
          os: string
        }[]
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
      totvs_absorcion_numero_v1: { Args: { p_value: string }; Returns: number }
      totvs_absorcion_sucursal_codigo_v1: {
        Args: { p_sucursal: string }
        Returns: string
      }
      totvs_cancelar_cxc_carga_v1: {
        Args: { p_carga_id: string }
        Returns: undefined
      }
      totvs_cancelar_mayor_carga_v1: {
        Args: { p_carga_id: string }
        Returns: undefined
      }
      totvs_consolidacion_documento_v1: {
        Args: { p_documento: string }
        Returns: string
      }
      totvs_consolidacion_sucursal_codigo_v1: {
        Args: { p_sucursal: string }
        Returns: string
      }
      totvs_consultar_absorcion_dinamica_v1: {
        Args: { p_desde?: string; p_hasta?: string; p_sucursal?: string }
        Returns: Json
      }
      totvs_consultar_componentes_absorcion_rapidos_v1: {
        Args: { p_desde: string; p_hasta: string }
        Returns: Json
      }
      totvs_consultar_consolidacion_tecnica_v1: {
        Args: { p_desde: string; p_hasta: string }
        Returns: Json
      }
      totvs_consultar_cxc_resumen_v1: {
        Args: { p_corte?: string }
        Returns: Json
      }
      totvs_consultar_mayor_absorcion_evidencia_v1: {
        Args: never
        Returns: Json
      }
      totvs_consultar_mayor_resumen_v1: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: Json
      }
      totvs_cron_drenar_consolidacion_v1: { Args: never; Returns: Json }
      totvs_encolar_consolidacion_tecnica_v1: {
        Args: {
          p_evento: string
          p_facturacion_carga_id?: string
          p_mayor_carga_id?: string
        }
        Returns: number
      }
      totvs_finalizar_cxc_carga_v1: {
        Args: { p_carga_id: string; p_control: Json }
        Returns: Json
      }
      totvs_finalizar_mayor_carga_v1: {
        Args: { p_carga_id: string; p_control: Json }
        Returns: Json
      }
      totvs_finalizar_transferencias_transito_v1: {
        Args: { p_carga_id: string }
        Returns: undefined
      }
      totvs_importar_cxc_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json; p_modo: string }
        Returns: Json
      }
      totvs_importar_despacho_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_importar_facturas_compra_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_importar_kardex_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_importar_kardex_sintetico_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_importar_mayor_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json; p_modo: string }
        Returns: Json
      }
      totvs_importar_ordenes_servicio_lote_v1: {
        Args: { p_filas: Json; p_importacion_id: string; p_lote_numero: number }
        Returns: Json
      }
      totvs_importar_pedidos_venta_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_importar_proveedores_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_importar_transferencias_transito_lote_v1: {
        Args: { p_carga_id: string; p_filas: Json }
        Returns: Json
      }
      totvs_iniciar_cxc_carga_v1: { Args: { p_metadata: Json }; Returns: Json }
      totvs_iniciar_mayor_carga_v1: {
        Args: { p_metadata: Json }
        Returns: string
      }
      totvs_procesar_cola_consolidacion_core_v1: { Args: never; Returns: Json }
      totvs_procesar_cola_consolidacion_v1: { Args: never; Returns: Json }
      totvs_recalcular_consolidacion_tecnica_v1: {
        Args: {
          p_evento: string
          p_facturacion_carga_id?: string
          p_mayor_carga_id?: string
        }
        Returns: string
      }
      totvs_refrescar_consolidacion_post_import_v1: {
        Args: { p_facturacion_carga_id?: string; p_mayor_carga_id?: string }
        Returns: Json
      }
      totvs_registrar_mayor_absorcion_evidencia_v1: {
        Args: {
          p_contract: Json
          p_ledger_load_id: string
          p_supporting_load_id: string
        }
        Returns: Json
      }
      totvs_sha256_text_v1: { Args: { p_value: string }; Returns: string }
      touch_user_presence: {
        Args: { p_last_activity_at?: string }
        Returns: undefined
      }
      valor_json_insensible: {
        Args: { p_claves: string[]; p_datos: Json }
        Returns: string
      }
      ventas_area_analisis: {
        Args: {
          p_area: string
          p_buscar?: string
          p_columnas?: string
          p_desde: string
          p_filas?: string
          p_hasta: string
          p_medida?: string
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_area_analisis_negocio: {
        Args: {
          p_area: string
          p_buscar?: string
          p_columnas?: string
          p_desde: string
          p_filas?: string
          p_hasta: string
          p_medida?: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_area_documentos: {
        Args: {
          p_area: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_area_movimientos_base: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_sucursal?: string
        }
        Returns: {
          area_calculada: string
          cantidad: number
          chasis: string
          cliente: string
          codigo: string
          codigo_fabricante: string
          concepto: string
          descripcion: string
          es_nota_credito: boolean
          factura: string
          fecha: string
          linea_id: string
          marca: string
          metodologia: string
          modelo: string
          os_numero: string
          sucursal: string
          total_venta: number
          vinculada_os: boolean
        }[]
      }
      ventas_area_resumen: {
        Args: {
          p_area: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_limite?: number
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_clientes_comparacion: {
        Args: {
          p_area: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_es_otro_comercial: {
        Args: { p_descripcion: string; p_grupo: string }
        Returns: boolean
      }
      ventas_es_refacturacion_servicio_sin_os: {
        Args: {
          p_codigo: string
          p_concepto: string
          p_descripcion: string
          p_raw_data: Json
        }
        Returns: boolean
      }
      ventas_historial_tipo_tiempo_procedencia: {
        Args: { p_tipo: string }
        Returns: string
      }
      ventas_historial_vinculo_os_publicable: {
        Args: {
          p_chasis_solicitado: string
          p_coincidencias_numero: number
          p_factura_sucursal: string
          p_os_chasis: string
          p_os_sucursal: string
        }
        Returns: boolean
      }
      ventas_linea_tipo_tiempo: {
        Args: { p_id: string; p_metodologia: string; p_os_tipo: string }
        Returns: string
      }
      ventas_maquinas_cancelar_historico_v1: {
        Args: { p_carga_id: string }
        Returns: undefined
      }
      ventas_maquinas_cancelar_historico_v2: {
        Args: { p_carga_id: string }
        Returns: undefined
      }
      ventas_maquinas_dashboard_v1: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
        }
        Returns: Json
      }
      ventas_maquinas_dashboard_v2: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
        }
        Returns: Json
      }
      ventas_maquinas_es_fabrizio_v1: { Args: never; Returns: boolean }
      ventas_maquinas_estado_historico_v1: { Args: never; Returns: Json }
      ventas_maquinas_estado_historico_v2: { Args: never; Returns: Json }
      ventas_maquinas_finalizar_historico_v1: {
        Args: { p_carga_id: string }
        Returns: Json
      }
      ventas_maquinas_finalizar_historico_v2: {
        Args: { p_carga_id: string }
        Returns: Json
      }
      ventas_maquinas_fuente_v2: {
        Args: { p_desde: string; p_hasta: string; p_sucursal?: string }
        Returns: {
          cantidad: number
          chasis: string
          cliente: string
          cod_mercaderia: string
          codigo_pedido: string
          condicion_fuente: string
          descripcion: string
          es_nota_credito: boolean
          factura: string
          fecha: string
          linea_id: string
          marca: string
          metodologia: string
          modelo: string
          pedido_fecha: string
          sucursal: Database["public"]["Enums"]["sucursal"]
          tipo_maquina: string
          total_venta: number
          vendedor: string
        }[]
      }
      ventas_maquinas_importar_historico_lote_v1: {
        Args: { p_carga_id: string; p_lineas: Json }
        Returns: Json
      }
      ventas_maquinas_importar_historico_lote_v2: {
        Args: { p_carga_id: string; p_lineas: Json }
        Returns: Json
      }
      ventas_maquinas_iniciar_historico_v1: {
        Args: { p_archivo_nombre: string; p_filas_archivo: number }
        Returns: string
      }
      ventas_maquinas_iniciar_historico_v2: {
        Args: {
          p_archivo_nombre: string
          p_archivos?: number
          p_fecha_desde: string
          p_fecha_hasta: string
          p_filas_archivo: number
          p_iva_estado?: string
          p_moneda?: string
        }
        Returns: string
      }
      ventas_maquinas_previsualizar_historico_v2: {
        Args: { p_lineas: Json }
        Returns: Json
      }
      ventas_normalizar_vendedor_maquinas: {
        Args: { p_vendedor: string }
        Returns: string
      }
      ventas_orden_natural: { Args: { p_texto: string }; Returns: string }
      ventas_repuestos_estado_historico_v1: { Args: never; Returns: Json }
      ventas_repuestos_listado_filtros_v1: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_direccion?: string
          p_exportar?: boolean
          p_hasta: string
          p_marca?: string
          p_orden?: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
          p_vendedor?: string
          p_vista?: string
        }
        Returns: Json
      }
      ventas_repuestos_listado_v1: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
          p_vista?: string
        }
        Returns: Json
      }
      ventas_repuestos_listado_v2: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
          p_vista?: string
        }
        Returns: Json
      }
      ventas_repuestos_listado_v3: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_direccion?: string
          p_exportar?: boolean
          p_hasta: string
          p_orden?: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
          p_vista?: string
        }
        Returns: Json
      }
      ventas_repuestos_movimientos_filtrados_v1: {
        Args: {
          p_buscar: string
          p_desde: string
          p_hasta: string
          p_marca: string
          p_sucursal: string
          p_vendedor: string
        }
        Returns: {
          cantidad: number
          cliente: string
          codigo: string
          codigo_fabricante: string
          descripcion: string
          documento: string
          es_nota_credito: boolean
          factura: string
          fecha: string
          id: string
          importe: number
          marca: string
          metodologia: string
          sucursal: string
          vendedor: string
        }[]
      }
      ventas_repuestos_movimientos_v1: {
        Args: {
          p_buscar: string
          p_desde: string
          p_hasta: string
          p_sucursal: string
        }
        Returns: {
          cantidad: number
          cliente: string
          codigo: string
          codigo_fabricante: string
          descripcion: string
          documento: string
          es_nota_credito: boolean
          factura: string
          fecha: string
          id: string
          importe: number
          metodologia: string
          sucursal: string
        }[]
      }
      ventas_repuestos_movimientos_v2: {
        Args: {
          p_buscar: string
          p_desde: string
          p_hasta: string
          p_sucursal: string
        }
        Returns: {
          cantidad: number
          cliente: string
          codigo: string
          codigo_fabricante: string
          descripcion: string
          documento: string
          es_nota_credito: boolean
          factura: string
          fecha: string
          id: string
          importe: number
          marca: string
          metodologia: string
          sucursal: string
          vendedor: string
        }[]
      }
      ventas_repuestos_normalizar_vendedor: {
        Args: { p_nombre: string }
        Returns: string
      }
      ventas_repuestos_panorama_filtros_v1: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_vendedor?: string
        }
        Returns: Json
      }
      ventas_repuestos_panorama_v1: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_repuestos_panorama_v2: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_servicios_codigo_filtro: {
        Args: { p_linea: Json }
        Returns: string
      }
      ventas_servicios_cumple_filtros: {
        Args: { p_filtros: Json; p_linea: Json }
        Returns: boolean
      }
      ventas_servicios_detalle_os: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_sucursal?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_detalle_os_v2: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_dimensiones: { Args: never; Returns: Json }
      ventas_servicios_factura_clave: {
        Args: { p_factura: string }
        Returns: string
      }
      ventas_servicios_historial: {
        Args: { p_chasis: string; p_vista?: string }
        Returns: Json
      }
      ventas_servicios_indicadores_v1: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_indicadores_v1_filtrado: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_filtros?: Json
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_lineas: {
        Args: {
          p_desde: string
          p_hasta: string
          p_sucursal?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_lineas_v2: {
        Args: {
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_lineas_v2_filtrado: {
        Args: {
          p_desde: string
          p_filtros?: Json
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_maquinas_identidad: {
        Args: never
        Returns: {
          chasis_clave: string
          fuente_propietario: string
          marca_parque: string
          modelo_tipo: string
          propietario: string
          tipo_maquina: string
        }[]
      }
      ventas_servicios_movimientos_enriquecidos: {
        Args: { p_desde: string; p_hasta: string; p_sucursal?: string }
        Returns: {
          area_calculada: string
          cantidad: number
          chasis: string
          cliente: string
          cliente_os: string
          codigo: string
          codigo_fabricante: string
          concepto: string
          descripcion: string
          es_nota_credito: boolean
          factura: string
          fecha: string
          linea_id: string
          marca: string
          marca_parque: string
          metodologia: string
          modelo: string
          nro_chasis: string
          os_numero: string
          propietario: string
          propietario_os: string
          sucursal: string
          texto_busqueda: string
          tipo_maquina: string
          tipo_tiempo: string
          total_venta: number
          vinculada_os: boolean
          vinculo_os: string
        }[]
      }
      ventas_servicios_os: {
        Args: {
          p_area: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_pagina?: number
          p_por_pagina?: number
          p_sucursal?: string
        }
        Returns: Json
      }
      ventas_servicios_panorama: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_sucursal?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_panorama_v2: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_panorama_v2_filtrado: {
        Args: {
          p_agrupacion?: string
          p_buscar?: string
          p_desde: string
          p_filtros?: Json
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_tecnicos_v1: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_tecnicos_v1_filtrado: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_filtros?: Json
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_tecnicos_v2: {
        Args: {
          p_buscar?: string
          p_desde: string
          p_filtros?: Json
          p_hasta: string
          p_marca?: string
          p_sucursal?: string
          p_tipo_maquina?: string
          p_tipo_tiempo?: string
        }
        Returns: Json
      }
      ventas_servicios_terceros_auditoria: {
        Args: { p_desde: string; p_hasta: string; p_sucursal?: string }
        Returns: {
          cliente: string
          diagnostico: string
          os_numero: string
          otros_facturados: number
          sucursal: string
          terceros_registrados_os: number
          total_facturado_os: number
        }[]
      }
      ventas_servicios_texto_normalizado: {
        Args: { p_texto: string }
        Returns: string
      }
      ventas_servicios_validar_filtros: {
        Args: { p_filtros: Json }
        Returns: undefined
      }
      ventas_tipo_tiempo_historial_os: {
        Args: {
          p_cliente: string
          p_factura: string
          p_servicios_valor: number
          p_tipo: string
        }
        Returns: string
      }
      ventas_tipo_tiempo_historico_cliente: {
        Args: { p_cliente: string; p_tipo?: string }
        Returns: string
      }
      ventas_tipo_tiempo_normalizado: {
        Args: { p_valor: string }
        Returns: string
      }
      ventas_tipo_tiempo_refacturacion_cliente: {
        Args: { p_cliente: string; p_tipo?: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
