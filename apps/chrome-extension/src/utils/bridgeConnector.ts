import { ExtensionBridgePageBrowserSide } from '@darkpatternhunter/web/bridge-mode-browser';

export type BridgeStatus =
  | 'listening'
  | 'connected'
  | 'disconnected'
  | 'closed';

export class BridgeConnector {
  private activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
  private status: BridgeStatus = 'closed';
  private connectRetryInterval = 300;

  constructor(
    private onMessage: (
      message: string,
      type: 'log' | 'status',
    ) => void = () => {},
    private onStatusChange: (status: BridgeStatus) => void = () => {},
  ) {}

  private setStatus(status: BridgeStatus) {
    this.status = status;
    this.onStatusChange(status);
  }

  async connect(): Promise<void> {
    if (this.status === 'listening' || this.status === 'connected') {
      return;
    }

    this.setStatus('listening');

    const connectLoop = async () => {
      while (true) {
        if (this.status === 'connected') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (this.status === 'closed') {
          break;
        }

        if (this.status !== 'listening' && this.status !== 'disconnected') {
          throw new Error(`unexpected status: ${this.status}`);
        }

        let activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
        try {
          activeBridgePage = new ExtensionBridgePageBrowserSide(() => {
            if (this.status !== 'closed') {
              this.setStatus('disconnected');
              this.activeBridgePage = null;
            }
          }, this.onMessage);

          await activeBridgePage.connect();
          this.activeBridgePage = activeBridgePage;
          this.setStatus('connected');
        } catch (e) {
          this.activeBridgePage?.destroy();
          this.activeBridgePage = null;
          console.warn('failed to setup connection', e);
          await new Promise((resolve) =>
            setTimeout(resolve, this.connectRetryInterval),
          );
        }
      }
    };

    connectLoop();
  }

  async disconnect(): Promise<void> {
    if (this.status === 'closed') {
      return;
    }

    try {
      if (this.activeBridgePage) {
        try {
          await this.activeBridgePage.destroy();
        } catch (error) {
          console.warn('Error destroying bridge page:', error);
        }
        this.activeBridgePage = null;
      }
    } catch (error) {
      console.warn('Error during disconnect:', error);
    } finally {
      this.setStatus('closed');
    }
  }

  getStatus(): BridgeStatus {
    return this.status;
  }
}
