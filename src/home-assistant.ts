import { filter } from 'rxjs/operators';
import { HAMessageType, IHAConfig, IHAResultMessage } from './declarations';
import { HomeAssistantEntities } from './entities';
import { HomeAssistantEvents } from './events';
import { HomeAssistantService } from './service';
import { HomeAssistantAuth } from './util/auth';
import { HomeAssistantConnection } from './util/connection';

export class HomeAssistant {
  constructor(public config: IHAConfig) {
    this.config.host = this.config.host || '127.0.0.1';
    this.config.port = this.config.port || 8123;

    if (!this.config.token) {
      throw new Error(
        'Missing token. You can create a new token in Home Assistant -> Your User -> Long-Lived Access Tokens.',
      );
    }

    this.initHA();
  }

  private readonly connection = new HomeAssistantConnection(this);

  readonly events = new HomeAssistantEvents(this, this.connection);
  readonly service = new HomeAssistantService(this, this.connection);
  readonly entities = new HomeAssistantEntities(this, this.connection);
  private readonly auth = new HomeAssistantAuth(this, this.connection);

  getHAVersion() {
    return this.auth.haVersion;
  }

  private initHA() {
    this.connection.connect();
    this.connection.wsMessage$
      .pipe(
        filter(
          ($event: IHAResultMessage) =>
            $event.type === HAMessageType.Result ||
            $event.type === HAMessageType.Pong,
        ),
      )
      .subscribe($event => this.connection.handleResponse($event));
  }
}
