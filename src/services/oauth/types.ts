export type SubscriptionType = string

export type RateLimitTier = string

export type BillingType = string

export type OAuthProfileResponse = {
  account: {
    uuid: string
    email: string
    display_name?: string | null
    created_at?: string
    [key: string]: unknown
  }
  organization: {
    uuid: string
    organization_type?: string | null
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    subscription_created_at?: string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token: string | null
  expires_in: number
  scope?: string
  account?: {
    uuid: string
    email_address: string
    [key: string]: unknown
  }
  organization?: {
    uuid: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid?: string
  }
}

export type UserRolesResponse = {
  organization_role?: string | null
  workspace_role?: string | null
  organization_name?: string | null
  [key: string]: unknown
}

export type ReferralCampaign = string

export type ReferrerRewardInfo = {
  amount_minor_units: number
  currency: string
  [key: string]: unknown
}

export type ReferralEligibilityResponse = {
  eligible: boolean
  remaining_passes?: number
  referrer_reward?: ReferrerRewardInfo | null
  referral_code_details?: {
    referral_link?: string
    campaign?: ReferralCampaign
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type ReferralRedemptionsResponse = {
  limit?: number
  redemptions?: Array<Record<string, unknown>>
  [key: string]: unknown
}
