import {
  BehaviorSubject,
  fromEvent,
  interval,
  merge,
  Observable,
  of,
  Subject,
} from 'rxjs';
import {
  catchError,
  delay,
  filter,
  map,
  switchMap,
  take,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';
import {
  HAConnectionStatus,
  HAMessageType,
  IHAMessageBase,
  IHAMessageWithId,
  IHAResultMessage,
} from '..';
import { HomeAssistant } from '../home-assistant';
import WebSocket = require('ws');

export class HomeAssistantConnection {
  constructor(private hass: HomeAssistant) {}

  private ws: WebSocket | null = null;

  readonly connectionStatus$ = new BehaviorSubject<HAConnectionStatus>(
    HAConnectionStatus.Disconnected,
  );

  readonly ready$ = this.connectionStatus$.pipe(
    map(status => status === HAConnectionStatus.Ready),
    filter(ready => ready),
    take(1),
  );

  get connectionStatus() {
    return this.connectionStatus$.value;
  }

  get url() {
    const { config } = this.hass;
    return `ws://${config.host}:${config.port}/api/websocket`;
  }

  timeout = 5000;

  readonly wsMessage$ = new Subject<IHAMessageBase>();
  private resultSubjects: Record<number, Subject<IHAResultMessage>> = {};
  private lastMessageTime = 0;

  id = 1;

  pingSend = false;
  private pingInterval = 2000;
  private connectionId = 0;
  /**
   * Send to HA with ID
   */
  send(data: IHAMessageWithId): Observable<IHAResultMessage> {
    if (this.connectionStatus < HAConnectionStatus.Connected) {
      return of({
        id: 0,
        type: HAMessageType.Result,
        success: false,
        result: null,
        error: {
          code: -1,
          message: 'Not connected to HA',
        },
      } as IHAResultMessage);
    }

    if (!data.id) {
      data.id = this.getNextId();
    }

    const reqConnectionId = this.connectionId;

    this.resultSubjects[data.id] = new Subject<IHAResultMessage>();

    this.sendWs(data);

    return this.resultSubjects[data.id].pipe(
      timeout(this.timeout),
      catchError(() => {
        if (this.connectionId === reqConnectionId) {
          console.log('Timeout. Reconnecting');
          this.reconnect();
        }

        return of({
          id: data.id,
          type: HAMessageType.Result,
          success: false,
          result: null,
          error: {
            code: -2,
            message: 'Timeout',
          },
        } as IHAResultMessage);
      }),
      // catchError(() => throwError({
      //   id: 0,
      //   type: HAMessageType.Result,
      //   success: false,
      //   result: null,
      //   error: {
      //     code: -2,
      //     message: 'Timeout'
      //   }
      // } as IHAResultMessage))
    );
  }

  /**
   * Main connect
   */
  connect() {
    console.log('Connecting to HA ', this.url);
    this.ws = new WebSocket(this.url);

    this.connectionId++;
    this.setStatus(HAConnectionStatus.Connecting);

    const wsOpen$ = fromEvent(this.ws, 'open').pipe(
      take(1),
      tap((event: WebSocket.OpenEvent) => {
        console.log(`HA connected: ${event.target}`);
      }),
    );

    const wsError$ = fromEvent(this.ws, 'error').pipe(
      take(1),
      map((data: WebSocket.ErrorEvent) => {
        throw new Error(`HA connection error: ${data.message}`);
      }),
    );

    const messagesSubscription = fromEvent(this.ws, 'message')
      .pipe(
        map(($event: WebSocket.MessageEvent) =>
          JSON.parse($event.data as string),
        ),
        tap($event => {
          // console.log('Received from HA', $event);
          this.lastMessageTime = Date.now();
        }),
      )
      .subscribe(this.wsMessage$);

    fromEvent(this.ws, 'close')
      .pipe(
        take(1),
        tap((event: WebSocket.CloseEvent) => {
          console.log(`HA disconnected: ${event.reason}`);

          messagesSubscription.unsubscribe();

          this.ws = null;
        }),
        delay(2000),
      )
      .subscribe(() => this.connect());

    return merge(wsOpen$, wsError$).pipe();
  }

  ping(): Observable<any> {
    return interval(this.pingInterval).pipe(
      withLatestFrom(this.connectionStatus$),
      filter(([interval, status]) =>
        [HAConnectionStatus.Connected, HAConnectionStatus.Ready].includes(
          status,
        ),
      ),
      filter(
        () =>
          !this.pingSend &&
          this.lastMessageTime + this.pingInterval < Date.now(),
      ),
      switchMap(() => this.ping()),
    );
  }

  /**
   * Reconnect to HA
   */
  reconnect() {
    if (this.ws) {
      // Causes Websocket.CloseEvent to be fired,
      // which triggers the fromEvent(this.ws, 'close') Observable to emit
      this.disconnect();
    }
  }

  disconnect() {
    this.ws && this.ws.close();
  }

  setStatus(status: HAConnectionStatus) {
    console.log(
      `Connection status: ${this.getConnectionStatusMessage(status)}`,
    );

    if (status === HAConnectionStatus.Connected) {
      this.id = 1;
      this.pingSend = false;
    }

    this.connectionStatus$.next(status);
  }

  /**
   * Handle HS result message
   * @param $event
   */
  handleResponse($event: IHAResultMessage) {
    if (!$event.id) {
      return;
    }

    const subject = this.resultSubjects[$event.id];

    if (subject) {
      subject.next($event);
      subject.complete();
    }

    delete this.resultSubjects[$event.id];
  }

  /**
   * Returns next id for WS
   */
  getNextId(): number {
    return this.id++;
  }

  private getConnectionStatusMessage(status: HAConnectionStatus) {
    switch (status) {
      case HAConnectionStatus.Authenticating:
        return 'Sending auth with access token';

      case HAConnectionStatus.Connected:
        return 'Authenticated with HA';

      case HAConnectionStatus.Ready:
        return 'HA ready';
    }
  }

  /**
   * Send ping
   */
  private pingHA() {
    this.pingSend = true;

    return this.send({
      type: HAMessageType.Ping,
    }).pipe(tap((data: IHAResultMessage) => (this.pingSend = false)));
  }

  /**
   * General send data to ha
   */
  private sendWs(data: IHAMessageBase) {
    this.ws && this.ws.send(JSON.stringify(data));
  }
}
