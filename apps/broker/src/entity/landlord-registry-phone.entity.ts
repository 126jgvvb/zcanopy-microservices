import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A phone number registered against a landlord on the canonical landlord
 * registry.
 *
 * A landlord can be reached on more than one number (a personal phone, a
 * work phone, a spouse's number…). Keeping them all here means a single
 * unreachable number does not block the landlord's OTPs. Exactly one row per
 * landlord is flagged `isPrimary` — that is the number every SMS (landlord
 * authorisation, withdrawal authorisation) is delivered to.
 */
@Entity()
@Index(['landlordNin'])
export class LandlordRegistryPhoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The landlord's 14-character Ugandan NIN — the registry key. */
  @Column({ default: '' })
  landlordNin!: string;

  /** The contact number, stored in +2567XXXXXXXX form. */
  @Column({ default: '' })
  phoneNumber!: string;

  /** True for the single number that receives the landlord's SMS OTPs. */
  @Column({ default: false })
  isPrimary!: boolean;

  /** Optional note so an admin can tell the numbers apart. */
  @Column({ nullable: true })
  label?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
