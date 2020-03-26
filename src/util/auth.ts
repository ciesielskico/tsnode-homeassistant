import { merge } from 'rxjs';
import { filter, switchMap, tap } from 'rxjs/operators';
import {
  HAConnectionStatus,
  HAMessageType,
  IHAConnectAuthToken,
  IHAConnectInit,
} from '..';
import { IHAConnectAuthInvalid } from '../declarations';
import { HomeAssistant } from '../home-assistant';
import { HomeAssistantConnection } from './connection';

export class HomeAssistantAuth {
  constructor(
    private hass: HomeAssistant,
    private connection: HomeAssistantConnection,
  ) {
    this.init().subscribe();
  }

  haVersion = '';

  private init() {
    // Need to auth
    const authRequired$ = this.connection.wsMessage$.pipe(
      filter($event => $event.type === HAMessageType.AuthRequired),
      tap(($event: IHAConnectInit) => this.authenticate($event)),
    );

    // Auth OK
    const authOK$ = this.connection.wsMessage$.pipe(
      filter($event => $event.type === HAMessageType.AuthOK),
      switchMap(($event: IHAConnectInit) => this.setAuthenticated($event)),
    );

    // Auth fail
    const authInvalid$ = this.connection.wsMessage$.pipe(
      filter($event => $event.type === HAMessageType.AuthInvalid),
      tap(($event: IHAConnectAuthInvalid) => this.authInvalid($event)),
    );

    return merge(authRequired$, authOK$, authInvalid$);
  }

  /**
   * Send auth token
   */
  private authenticate($event: IHAConnectInit) {
    this.connection.setStatus(HAConnectionStatus.Authenticating);

    this.haVersion = $event.ha_version;

    this.connection.send({
      type: HAMessageType.Auth,
      access_token: this.hass.config.token,
    } as IHAConnectAuthToken);
  }

  /**
   * Set auth success
   */
  private setAuthenticated($event: IHAConnectInit) {
    this.connection.setStatus(HAConnectionStatus.Connected);
    this.haVersion = $event.ha_version;

    return this.hass.entities
      .fetchEntities()
      .pipe(tap(() => this.connection.setStatus(HAConnectionStatus.Ready)));
  }

  /**
   * Handle invalid token
   */
  private authInvalid($event: IHAConnectAuthInvalid) {
    console.log(`HA authentication failed: "${$event.message}"`);
    this.connection.disconnect();
  }
}
