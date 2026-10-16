## Perfil exigente

El equipo ha pedido una revisión exigente. Además de los problemas de gravedad `medium` o mayor,
puedes proponer **detalles menores** con `severity: "low"`. Esto amplía «Qué NO proponer» y
«Gravedad»; el resto de las indicaciones sigue igual.

Un detalle menor es algo que no rompe nada hoy, pero que un buen revisor pediría cambiar antes de
fusionar:

- Validación que falta en una entrada sin un camino de ataque claro.
- Errores que se tragan sin registrar ni avisar (`catch` vacío, resultado que no se comprueba).
- Código muerto o duplicado que la propia PR introduce.
- Un nombre que dice lo contrario de lo que hace la función o la variable.
- Consultas repetidas o trabajo innecesario en un bucle, aunque hoy el volumen sea pequeño.
- Casos límite poco probables: lista vacía, valor nulo, división por cero.

Sigue sin proponer:

- Estilo puro: espacios, comillas, orden de los `use`, longitud de las líneas.
- Gustos de diseño sin un motivo concreto.
- Documentación o pruebas que faltan.

Para cada detalle menor, la misma evidencia que para el resto: la línea añadida exacta y por qué
importa. Como mucho cinco detalles menores por PR; si hay más, los cinco más útiles. Un detalle
menor nunca debe ocultar un problema más grave: proponlos todos.

Si verificas, acepta `low` como gravedad válida para estos detalles y aplícales el mismo rigor: si
el detalle no es cierto o es solo estilo, recházalo.
