import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Canonical record of a landlord + property title that an admin has verified.
 * It is keyed by the landlord's NIN so that another broker submitting the
 * same landlord can be matched against it and asked to prove the landlord
 * also authorised them (OTP to the landlord + broker NIN check).
 */
@Entity()
@Index(['landlordNin'], { unique: true })
export class LandlordRegistryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Unique key: the landlord's 14-character Ugandan NIN. */
  @Column({ unique: true })
  landlordNin!: string;

  @Column({ default: '' })
  landlordFullName!: string;

  @Column({ default: '' })
  landlordPhoneNumber!: string;

  @Column({ nullable: true })
  landlordEmail?: string;

  @Column({ default: '' })
  mzoDistrict!: string;

  @Column({ default: 'mailo' })
  tenureType!: string;

  @Column({ nullable: true })
  countyDivision?: string;

  @Column({ nullable: true })
  blockNumber?: string;

  @Column({ nullable: true })
  plotNumber?: string;

  @Column({ nullable: true })
  volumeNumber?: string;

  @Column({ nullable: true })
  folioNumber?: string;

  @Column({ nullable: true })
  leaseExpiryDate?: string;

  @Column({ nullable: true })
  subCountyVillage?: string;

  @Column({ nullable: true })
  ccoRefNumber?: string;

  /** Ministry instrument number recorded when the details were approved. */
  @Column({ nullable: true })
  instrumentNumber?: string;

  /* ---- Provenance ---- */
  @Column({ default: '' })
  sourceVerificationId!: string;

  @Column({ default: '' })
  sourceBrokerId!: string;

  @Column({ default: '' })
  sourceBrokerCode!: string;

  @Column({ nullable: true })
  approvedByAdminId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
