
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "cart_items": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"modifier_ids": (string)[],"notes": string,"quantity": number,"session_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"modifier_ids"?: (string)[],"notes"?: string,"quantity": number,"session_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"modifier_ids"?: (string)[],"notes"?: string,"quantity"?: number,"session_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_categories_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "allergens": (string)[],"category_id": string,"created_at": string,"description": string,"dietary_tags": (string)[],"id": string,"image_url": string | null,"in_stock": boolean,"ingredients": (string)[],"name": string,"price_cents": number,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergens"?: (string)[],"category_id": string,"created_at"?: string,"description"?: string,"dietary_tags"?: (string)[],"id"?: string,"image_url"?: string | null,"in_stock"?: boolean,"ingredients"?: (string)[],"name": string,"price_cents": number,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allergens"?: (string)[],"category_id"?: string,"created_at"?: string,"description"?: string,"dietary_tags"?: (string)[],"id"?: string,"image_url"?: string | null,"in_stock"?: boolean,"ingredients"?: (string)[],"name"?: string,"price_cents"?: number,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
      columns: ["category_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "menu_items_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_groups": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"max_select": number,"min_select": number,"name": string,"required": boolean,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"max_select"?: number,"min_select"?: number,"name": string,"required"?: boolean,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"max_select"?: number,"min_select"?: number,"name"?: string,"required"?: boolean,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_groups_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "modifier_groups_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"modifiers": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"in_stock": boolean,"name": string,"price_delta_cents": number,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"in_stock"?: boolean,"name": string,"price_delta_cents"?: number,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"in_stock"?: boolean,"name"?: string,"price_delta_cents"?: number,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifiers_group_id_restaurant_id_fkey"
      columns: ["group_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "modifiers_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "id": string,"item_id": string | null,"line_total_cents": number,"modifiers_snapshot": NonNullable<Json>,"name_snapshot": string,"notes": string,"order_id": string,"quantity": number,"unit_price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"item_id"?: string | null,"line_total_cents": number,"modifiers_snapshot"?: NonNullable<Json>,"name_snapshot": string,"notes"?: string,"order_id": string,"quantity": number,"unit_price_cents": number
                  }
                  Update: {
                    "id"?: string,"item_id"?: string | null,"line_total_cents"?: number,"modifiers_snapshot"?: NonNullable<Json>,"name_snapshot"?: string,"notes"?: string,"order_id"?: string,"quantity"?: number,"unit_price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"cancelled_at": string | null,"created_at": string,"currency": string,"delivered_at": string | null,"id": string,"paid_at": string | null,"platform_fee_cents": number,"ready_at": string | null,"restaurant_id": string,"session_id": string | null,"status": Database["public"]['Enums']["order_status"],"status_updated_at": string,"stripe_payment_intent_id": string | null,"subtotal_cents": number,"table_id": string,"tax_cents": number,"ticket_date": string | null,"ticket_number": number | null,"tip_cents": number,"total_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"currency": string,"delivered_at"?: string | null,"id"?: string,"paid_at"?: string | null,"platform_fee_cents": number,"ready_at"?: string | null,"restaurant_id": string,"session_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"status_updated_at"?: string,"stripe_payment_intent_id"?: string | null,"subtotal_cents": number,"table_id": string,"tax_cents": number,"ticket_date"?: string | null,"ticket_number"?: number | null,"tip_cents"?: number,"total_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"currency"?: string,"delivered_at"?: string | null,"id"?: string,"paid_at"?: string | null,"platform_fee_cents"?: number,"ready_at"?: string | null,"restaurant_id"?: string,"session_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"status_updated_at"?: string,"stripe_payment_intent_id"?: string | null,"subtotal_cents"?: number,"table_id"?: string,"tax_cents"?: number,"ticket_date"?: string | null,"ticket_number"?: number | null,"tip_cents"?: number,"total_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_table_id_restaurant_id_fkey"
      columns: ["table_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"restaurants": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"name": string,"platform_fee_bps": number,"slug": string,"stripe_account_id": string | null,"stripe_charges_enabled": boolean,"tax_rate_bps": number,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name": string,"platform_fee_bps"?: number,"slug": string,"stripe_account_id"?: string | null,"stripe_charges_enabled"?: boolean,"tax_rate_bps"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name"?: string,"platform_fee_bps"?: number,"slug"?: string,"stripe_account_id"?: string | null,"stripe_charges_enabled"?: boolean,"tax_rate_bps"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_members": {
                  Row: {
                    "created_at": string,"restaurant_id": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"restaurant_id": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"restaurant_id"?: string,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_members_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_events": {
                  Row: {
                    "event_id": string,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "event_id"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"table_sessions": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"last_seen_at": string,"restaurant_id": string,"table_id": string | null,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"last_seen_at"?: string,"restaurant_id": string,"table_id"?: string | null,"verified"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"last_seen_at"?: string,"restaurant_id"?: string,"table_id"?: string | null,"verified"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_sessions_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "table_sessions_table_id_restaurant_id_fkey"
      columns: ["table_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"tables": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"label": string,"qr_secret": string,"restaurant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label": string,"qr_secret"?: string,"restaurant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label"?: string,"qr_secret"?: string,"restaurant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_counters": {
                  Row: {
                    "last_number": number,"local_date": string,"restaurant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_number": number,"local_date": string,"restaurant_id": string
                  }
                  Update: {
                    "last_number"?: number,"local_date"?: string,"restaurant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_counters_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "order_status": "pending_payment"|"paid"|"accepted"|"ready"|"delivered"|"cancelled","staff_role": "owner"|"kitchen"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "order_status": ["pending_payment", "paid", "accepted", "ready", "delivered", "cancelled"],"staff_role": ["owner", "kitchen"]
          }
        }
} as const
