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
      importaciones: {
        Row: {
          archivo_nombre: string | null
          creado_en: string
          duplicados: number
          id: string
          insertados: number
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
          creado_en: string
          id: string
          nombre: string
          sucursal: Database["public"]["Enums"]["sucursal"] | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          id: string
          nombre: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          id?: string
          nombre?: string
          sucursal?: Database["public"]["Enums"]["sucursal"] | null
        }
        Relationships: []
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
          creado_en: string
          estado: Database["public"]["Enums"]["estado_servicio"]
          fecha: string
          horas_trabajadas: number | null
          id: string
          observaciones: string | null
          servicio_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_servicio"]
          fecha: string
          horas_trabajadas?: number | null
          id?: string
          observaciones?: string | null
          servicio_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_servicio"]
          fecha?: string
          horas_trabajadas?: number | null
          id?: string
          observaciones?: string | null
          servicio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicio_jornadas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
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
    }
    Enums: {
      app_role: "admin" | "cabecilla" | "tecnico"
      estado_servicio: "Pendiente" | "Iniciado" | "Completado"
      marca: "CLAAS" | "HORSCH" | "OTROS"
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
      estado_servicio: ["Pendiente", "Iniciado", "Completado"],
      marca: ["CLAAS", "HORSCH", "OTROS"],
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
      tipo_facturacion: ["Repuesto", "Servicio"],
      tipo_importacion: ["parque", "facturacion"],
      tipo_trabajo: ["Visita de campo", "Máquina en taller"],
    },
  },
} as const
