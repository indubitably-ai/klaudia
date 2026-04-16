import type { LocalJSXCommandOnDone } from '../../types/command.js'

export type PluginManageAction = 'enable' | 'disable' | 'uninstall'

export type MarketplaceManageAction = 'remove' | 'update'

export type ViewState =
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'validate'; path?: string }
  | { type: 'discover-plugins'; targetPlugin?: string }
  | {
      type: 'browse-marketplace'
      targetMarketplace?: string
      targetPlugin?: string
    }
  | {
      type: 'manage-plugins'
      targetPlugin?: string
      targetMarketplace?: string
      action?: PluginManageAction
    }
  | {
      type: 'manage-marketplaces'
      targetMarketplace?: string
      action?: MarketplaceManageAction
    }
  | { type: 'marketplace-list' }
  | { type: 'marketplace-menu' }
  | { type: 'add-marketplace'; initialValue?: string }

export type PluginSettingsProps = {
  onComplete: LocalJSXCommandOnDone
  args?: string
  showMcpRedirectMessage?: boolean
}
