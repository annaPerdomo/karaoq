import * as React from 'react';
import styles from '../../styles/Home.module.css';
import useInView from './hooks/useInView';

export default function Reveal({ children, className, delay }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [ref, visible] = useInView<HTMLDivElement>(0.1);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${visible ? styles.revealVisible : ''} ${className || ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
