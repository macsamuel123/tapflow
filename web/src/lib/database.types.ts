
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
      referencedRelation: "touchpoint_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"sort_order": number,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_categories_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "allergens": (string)[],"category_id": string,"created_at": string,"description": string,"dietary_tags": (string)[],"id": string,"image_url": string | null,"in_stock": boolean,"ingredients": (string)[],"name": string,"price_cents": number,"sort_order": number,"tax_category_id": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergens"?: (string)[],"category_id": string,"created_at"?: string,"description"?: string,"dietary_tags"?: (string)[],"id"?: string,"image_url"?: string | null,"in_stock"?: boolean,"ingredients"?: (string)[],"name": string,"price_cents": number,"sort_order"?: number,"tax_category_id": string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "allergens"?: (string)[],"category_id"?: string,"created_at"?: string,"description"?: string,"dietary_tags"?: (string)[],"id"?: string,"image_url"?: string | null,"in_stock"?: boolean,"ingredients"?: (string)[],"name"?: string,"price_cents"?: number,"sort_order"?: number,"tax_category_id"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_venue_id_fkey"
      columns: ["category_id","venue_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "menu_items_tax_category_fk"
      columns: ["tax_category_id","venue_id"]
isOneToOne: false
      referencedRelation: "tax_categories"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "menu_items_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_groups": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"max_select": number,"min_select": number,"name": string,"required": boolean,"sort_order": number,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"max_select"?: number,"min_select"?: number,"name": string,"required"?: boolean,"sort_order"?: number,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"max_select"?: number,"min_select"?: number,"name"?: string,"required"?: boolean,"sort_order"?: number,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_groups_item_id_venue_id_fkey"
      columns: ["item_id","venue_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "modifier_groups_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"modifiers": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"in_stock": boolean,"name": string,"price_delta_cents": number,"sort_order": number,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"in_stock"?: boolean,"name": string,"price_delta_cents"?: number,"sort_order"?: number,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"in_stock"?: boolean,"name"?: string,"price_delta_cents"?: number,"sort_order"?: number,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifiers_group_id_venue_id_fkey"
      columns: ["group_id","venue_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "modifiers_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "id": string,"item_id": string | null,"line_total_cents": number,"modifiers_snapshot": NonNullable<Json>,"name_snapshot": string,"notes": string,"order_id": string,"quantity": number,"tax_category_name_snapshot": string,"tax_rate_bps_snapshot": number,"unit_price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"item_id"?: string | null,"line_total_cents": number,"modifiers_snapshot"?: NonNullable<Json>,"name_snapshot": string,"notes"?: string,"order_id": string,"quantity": number,"tax_category_name_snapshot": string,"tax_rate_bps_snapshot": number,"unit_price_cents": number
                  }
                  Update: {
                    "id"?: string,"item_id"?: string | null,"line_total_cents"?: number,"modifiers_snapshot"?: NonNullable<Json>,"name_snapshot"?: string,"notes"?: string,"order_id"?: string,"quantity"?: number,"tax_category_name_snapshot"?: string,"tax_rate_bps_snapshot"?: number,"unit_price_cents"?: number
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
                    "accepted_at": string | null,"cancelled_at": string | null,"created_at": string,"currency": string,"delivered_at": string | null,"id": string,"paid_at": string | null,"platform_fee_cents": number,"ready_at": string | null,"session_id": string | null,"status": Database["public"]['Enums']["order_status"],"status_updated_at": string,"stripe_payment_intent_id": string | null,"subtotal_cents": number,"tax_cents": number,"ticket_date": string | null,"ticket_number": number | null,"tip_cents": number,"total_cents": number,"touchpoint_id": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"currency": string,"delivered_at"?: string | null,"id"?: string,"paid_at"?: string | null,"platform_fee_cents": number,"ready_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"status_updated_at"?: string,"stripe_payment_intent_id"?: string | null,"subtotal_cents": number,"tax_cents": number,"ticket_date"?: string | null,"ticket_number"?: number | null,"tip_cents"?: number,"total_cents": number,"touchpoint_id": string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"currency"?: string,"delivered_at"?: string | null,"id"?: string,"paid_at"?: string | null,"platform_fee_cents"?: number,"ready_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"status_updated_at"?: string,"stripe_payment_intent_id"?: string | null,"subtotal_cents"?: number,"tax_cents"?: number,"ticket_date"?: string | null,"ticket_number"?: number | null,"tip_cents"?: number,"total_cents"?: number,"touchpoint_id"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "touchpoint_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_touchpoint_id_venue_id_fkey"
      columns: ["touchpoint_id","venue_id"]
isOneToOne: false
      referencedRelation: "touchpoints"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "orders_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role": Database["public"]['Enums']["staff_role"],"user_id": string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_members_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
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
                },"tax_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"rate_bps": number,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"rate_bps": number,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"rate_bps"?: number,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_categories_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_counters": {
                  Row: {
                    "last_number": number,"local_date": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_number": number,"local_date": string,"venue_id": string
                  }
                  Update: {
                    "last_number"?: number,"local_date"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_counters_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"touchpoint_sessions": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"last_seen_at": string,"touchpoint_id": string | null,"venue_id": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"last_seen_at"?: string,"touchpoint_id"?: string | null,"venue_id": string,"verified"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"last_seen_at"?: string,"touchpoint_id"?: string | null,"venue_id"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "touchpoint_sessions_touchpoint_id_venue_id_fkey"
      columns: ["touchpoint_id","venue_id"]
isOneToOne: false
      referencedRelation: "touchpoints"
      referencedColumns: ["id","venue_id"]
    },{
      foreignKeyName: "touchpoint_sessions_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"touchpoints": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"kind": Database["public"]['Enums']["touchpoint_kind"],"label": string,"qr_secret": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["touchpoint_kind"],"label": string,"qr_secret"?: string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["touchpoint_kind"],"label"?: string,"qr_secret"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "touchpoints_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"name": string,"platform_fee_bps": number,"slug": string,"stripe_account_id": string | null,"stripe_charges_enabled": boolean,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name": string,"platform_fee_bps"?: number,"slug": string,"stripe_account_id"?: string | null,"stripe_charges_enabled"?: boolean,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name"?: string,"platform_fee_bps"?: number,"slug"?: string,"stripe_account_id"?: string | null,"stripe_charges_enabled"?: boolean,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
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
            "order_status": "pending_payment"|"paid"|"accepted"|"ready"|"delivered"|"cancelled","staff_role": "owner"|"fulfillment","touchpoint_kind": "table"|"seat"|"lounger"|"cart"|"room"|"counter"|"other"
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
            "order_status": ["pending_payment", "paid", "accepted", "ready", "delivered", "cancelled"],"staff_role": ["owner", "fulfillment"],"touchpoint_kind": ["table", "seat", "lounger", "cart", "room", "counter", "other"]
          }
        }
} as const
