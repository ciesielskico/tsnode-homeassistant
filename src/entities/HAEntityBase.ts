import { Observable, Subject } from 'rxjs';
import {
  HADomain,
  HAServiceType,
  IHAEntityBase,
  IHAEntityState,
  IHAResultMessage,
} from '../declarations';
import { HomeAssistant } from '../home-assistant';

export class HAEntityBase implements IHAEntityBase {
  entity_id: string = '';

  state: string = '';
  attributes: any = {};
  context: any = null;

  last_changed: string = '';
  last_updated: string = '';

  onUpdate = new Subject<void>();

  lastState: IHAEntityState | null = null;

  alive = false;

  protected attributesToUpdate: any = {};

  constructor(
    protected hass: HomeAssistant,
    state: IHAEntityState,
    public domain: HADomain,
    public objectId: string,
  ) {
    this.setStateFromHA(state, true);

    this.init();
  }

  setStateFromHA(state: IHAEntityState, skipSaveState: boolean = false) {
    if (!skipSaveState) {
      this.lastState = this.getState();
    }

    Object.assign(this, state);

    this.alive = true;

    this.onUpdate.next();
  }

  getState(): IHAEntityState {
    return JSON.parse(
      JSON.stringify({
        entity_id: this.entity_id,
        state: this.state,
        attributes: this.attributes,
        context: this.context,
        last_changed: this.last_changed,
        last_updated: this.last_updated,
      }),
    );
  }

  destroy() {
    this.alive = false;
  }

  protected init() {}

  protected callService(service: HAServiceType): Observable<IHAResultMessage> {
    return this.hass.service.call(this.domain, service, this.getServiceData());
  }

  protected getServiceData(): any {
    const data = {
      ...this.attributesToUpdate,
      entity_id: this.entity_id,
    };

    this.attributesToUpdate = {};

    return data;
  }
}
