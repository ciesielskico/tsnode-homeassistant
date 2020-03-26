import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  HADomain,
  HAMessageType,
  IHAEntityBase,
  IHAEntityState,
  IHAEvent,
  IHAEventStateChangeData,
  IHAResultMessage,
} from './declarations';
import { HAEntityBase } from './entities/HAEntityBase';
import { HAEntityBinary } from './entities/HAEntityBinary';
import { HAEntityLight } from './entities/HAEntityLight';
import { HAEntitySwitch } from './entities/HAEntitySwitch';
import { HomeAssistant } from './home-assistant';
import { HomeAssistantConnection } from './util/connection';

export class HomeAssistantEntities {
  onChange = new Subject<IHAEntityBase>();

  private entities: { [id: string]: HAEntityBase } = {};

  constructor(
    private hass: HomeAssistant,
    private connection: HomeAssistantConnection,
  ) {
    this.hass.events
      .select('state_changed')
      .subscribe(data => this.handleHAStateChange(data));
  }

  /**
   * Fetch and set states
   */
  fetchEntities(): Observable<HAEntityBase[]> {
    return this.connection
      .send({
        type: HAMessageType.GetStates,
      })
      .pipe(
        map(($event: IHAResultMessage<IHAEntityState[]>) => {
          if ($event.result) {
            $event.result.forEach((new_state: IHAEntityState) => {
              let entity = this.getEntity(new_state.entity_id);

              if (entity) {
                entity.setStateFromHA(new_state);
              } else {
                this.createEntity(new_state);
              }
            });
          }

          return Object.values(this.entities);
        }),
      );
  }

  /**
   * Get current state
   */
  getEntity<T extends IHAEntityBase>(entityId: string): T | null {
    return (this.entities[entityId] as any) || null;
  }

  /**
   * Handle HS result message
   */
  private handleHAStateChange($event: IHAEvent<IHAEventStateChangeData>) {
    const data = $event.data;

    let entity = this.getEntity(data.entity_id);

    if (data.new_state) {
      if (entity) {
        entity.setStateFromHA(data.new_state);
      } else {
        this.createEntity(data.new_state);
      }
    } else {
      if (entity) {
        entity.destroy();
      }
    }

    if (entity) {
      this.onChange.next(entity);
    }
  }

  private createEntity(state: IHAEntityState): HAEntityBase {
    const [domain, objectId] = state.entity_id.split('.');

    let className = HAEntityBase;

    switch (domain) {
      case HADomain.Switch:
      case HADomain.InputBoolean:
        className = HAEntitySwitch;
        break;

      case HADomain.BinarySensor:
        className = HAEntityBinary;
        break;

      case HADomain.Light:
        className = HAEntityLight;
    }

    const entity = new className(
      this.hass,
      state,
      domain as HADomain,
      objectId,
    );

    this.entities[entity.entity_id] = entity;

    return entity;
  }
}
