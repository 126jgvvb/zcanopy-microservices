import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class InvitationCodeEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  code!: string;

  @Column()
  role!: string;

  @Column()
  createdBy!: string;

  @Column()
  isUsed!: boolean;

  @Column()
  usedBy?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column()
  expiresAt!: Date;
}
