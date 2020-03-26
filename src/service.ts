import { Observable } from 'rxjs';
import {
  HADomain,
  HAMessageType,
  HAServiceType,
  IHACallServiceMessage,
  IHAResultMessage,
} from './declarations';
import { HomeAssistant } from './home-assistant';
import { toggleServiceActionType } from './util';
import { HomeAssistantConnection } from './util/connection';

export class HomeAssistantService {
  constructor(
    private hass: HomeAssistant,
    private connection: HomeAssistantConnection,
  ) {}

  /**
   * Call service
   */
  call(
    domain: HADomain,
    service: HAServiceType,
    serviceDataOrEntity?: any,
  ): Observable<IHAResultMessage> {
    const pack: IHACallServiceMessage = {
      type: HAMessageType.CallService,
      domain,
      service,
    };

    if (serviceDataOrEntity) {
      if (Array.isArray(serviceDataOrEntity)) {
        serviceDataOrEntity = {
          entity_id: serviceDataOrEntity.map(entity =>
            this.mapEntityDomain(domain, entity),
          ),
        };
      } else if (typeof serviceDataOrEntity === 'string') {
        serviceDataOrEntity = {
          entity_id: this.mapEntityDomain(domain, serviceDataOrEntity),
        };
      }

      pack.service_data = serviceDataOrEntity;
    }

    return this.connection.send(pack);
  }

  /**
   * Toggle event
   */
  toggle(
    domain: HADomain,
    entities: string[] | string,
    force?: boolean,
  ): Observable<IHAResultMessage> {
    return this.call(domain, toggleServiceActionType(force), {
      entity_id: entities,
    });
  }

  private mapEntityDomain(domain: HADomain, entity: string): string {
    if (!entity.startsWith(`${domain}.`)) {
      return `${domain}.${entity}`;
    }

    return entity;
  }
}
