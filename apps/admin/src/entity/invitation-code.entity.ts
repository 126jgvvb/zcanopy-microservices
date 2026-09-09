import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class InvitationCodeEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({default:'00000'})
  code!: string;

  @Column({default:'invitation'})
  role!: string;

  @Column({default:'super admin'})
  createdBy!: string;

  @Column({default:true})
  isUsed!: boolean;

  @Column({default:'super admin'})
  usedBy?: string;

  @CreateDateColumn({default:new Date()})
  createdAt!: Date;

  @Column({default:new Date()})
  expiresAt!: Date;
}
