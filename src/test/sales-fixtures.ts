export const saleLines = [
 {id:"l1",fecha:"2026-09-08",factura:"001000000082",cliente:"Campos del Mañana S.A.",sucursal:"Santa Rita",concepto:"Servicio",metodologia:"actual" as const,total_venta:480,cantidad:8,os_numero:"01-00000104",codigo:null,codigo_fabricante:null,descripcion:"Servicio técnico",marca:null,modelo:null,chasis:null,es_nota_credito:false},
 {id:"l2",fecha:"2026-09-08",factura:"001001005035",cliente:"Campos del Mañana S.A.",sucursal:"Santa Rita",concepto:"Repuestos",metodologia:"actual" as const,total_venta:39,cantidad:1,os_numero:"01-00000104",codigo:"REP000087",codigo_fabricante:"1395950",descripcion:"Tapa de cierre del depósito",marca:"CLAAS",modelo:null,chasis:null,es_nota_credito:false}
];
export const documentsFixture = { total:1,pagina:1,por_pagina:20,paginas:1,documentos:[
 {id:"OS:01-00000104",os_numero:"01-00000104",tipo:"OS",fecha:"2026-09-08",factura:"001000000082",facturas:2,cliente:"Campos del Mañana S.A.",sucursal:"Santa Rita",total_venta:519,cantidad_lineas:2,mano_obra:480,kilometraje:0,repuestos:39,otros:0,lineas:saleLines}
]};
export const clientsFixture = {comparable:true,desde_anterior:"2025-07-01",hasta_anterior:"2025-09-10",clientes:[
 {nombre:"Campos del Mañana S.A.",importe:519,importe_anterior:400,facturas:2,ordenes:1,ultima:"2026-09-08",sucursales:"Santa Rita"},
 {nombre:"Ganadera El Fogón S.A.",importe:250,importe_anterior:500,facturas:3,ordenes:2,ultima:"2026-09-07",sucursales:"Katuete"}
]};

