import type {
  MultiplayerTransport,
  MultiplayerTransportConnectOptions,
  PlayerState,
} from '../types'

/**
 * Placeholder transport for a future Supabase-based multiplayer backend.
 *
 * Planned implementation (not yet implemented):
 * - Use Supabase Realtime channels for a game room.
 * - Use Realtime presence to track connected players and their metadata (username, id).
 * - Broadcast movement and chat messages over the channel.
 * - Optionally use Supabase Auth for persistent user identities.
 * - Optionally store world edits in Postgres and subscribe via Realtime.
 */
export class SupabaseMultiplayerTransport implements MultiplayerTransport {
  private connected = false

  /** @inheritdoc */
  connect(options: MultiplayerTransportConnectOptions): void {
    // Placeholder: no real connection yet, only report a disconnected state.
    this.connected = false
    options.callbacks.onConnectChange(false)
  }

  /** @inheritdoc */
  disconnect(): void {
    this.connected = false
  }

  /** @inheritdoc */
  sendMove(_state: PlayerState): void {
    // Placeholder: no-op until Supabase Realtime is wired.
  }

  /** @inheritdoc */
  sendChat(_text: string): void {
    // Placeholder: no-op until Supabase Realtime is wired.
  }

  /** @inheritdoc */
  isConnected(): boolean {
    return this.connected
  }
}

