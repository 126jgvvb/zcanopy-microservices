import {Entity,Column,PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class CustomerSearchEntity{
 @PrimaryGeneratedColumn()
 id!:string;

 @Column()
 sessionId!:string;

 @Column()
 sessionToken!:string;

 @Column()
 query!:string;

 @Column()
 location!:string;

 @Column()
 radius!:number;

 @Column()
 propertyType!:string;

 @Column()
 createdAt!:Date;
}
