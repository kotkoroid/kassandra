<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { interactivity } from '@threlte/extras';

  interactivity();

  let rotation = $state(0);

  useTask((delta) => {
    rotation += delta;
  });
</script>

<T.PerspectiveCamera
  makeDefault
  position={[4, 4, 6]}
  oncreate={(ref) => ref.lookAt(0, 0, 0)}
/>

<T.AmbientLight intensity={0.4} />
<T.DirectionalLight position={[5, 10, 5]} intensity={1.2} />

<T.Mesh rotation.x={rotation} rotation.y={rotation}>
  <T.BoxGeometry args={[1, 1, 1]} />
  <T.MeshNormalMaterial />
</T.Mesh>
